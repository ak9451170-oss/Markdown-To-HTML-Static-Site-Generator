"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { convertMarkdown, escapeHtml } = require("../markdown");
const { getPool, testConnection } = require("../database/connection");

const projectFolder = path.resolve(__dirname, "..");
const inputFolder = path.join(projectFolder, "input");
const outputFolder = path.join(projectFolder, "output");
const port = Number(process.env.PORT) || 3000;
const maxRequestBodyBytes = 10 * 1024 * 1024;
const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/script.js", ["script.js", "text/javascript; charset=utf-8"]],
  ["/markdown.js", ["markdown.js", "text/javascript; charset=utf-8"]]
]);

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function isSafeOutputFilename(filename) {
  return /^[a-zA-Z0-9_-]+\.html$/i.test(filename) &&
    filename.toLowerCase() !== "index.html";
}

function createHomepage(pages) {
  const pageLinks = pages.length
    ? `<ul>
${pages.map((page) => `  <li><a href="./${escapeHtml(page.filename)}">${escapeHtml(page.title)}</a> <span>(${escapeHtml(page.filename)})</span></li>`).join("\n")}
</ul>`
    : `<p class="empty-state">No Markdown pages have been generated yet. Add .md files to the input folder and run the generator.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Markdown Pages</title>
  <style>
    * { box-sizing: border-box; }
    body { max-width: 760px; margin: 0 auto; padding: 32px 20px; color: #1f2933; font: 16px/1.6 system-ui, sans-serif; }
    h1 { color: #116b56; }
    ul { padding-left: 22px; }
    li { margin: 12px 0; overflow-wrap: anywhere; }
    a { color: #087f65; }
    span, .empty-state { color: #52616b; }
    @media (max-width: 480px) { body { padding: 22px 14px; } }
  </style>
</head>
<body>
  <main>
    <h1>Generated Markdown Pages</h1>
    <p>Select a page to open it. The filename is shown beside each page title.</p>
    ${pageLinks}
  </main>
</body>
</html>
`;
}

async function generateHtmlFiles(sourceFolder = inputFolder, generatedFolder = outputFolder) {
  await fs.mkdir(generatedFolder, { recursive: true });

  let entries;
  try {
    entries = await fs.readdir(sourceFolder, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      const missingFolderError = new Error("The input folder does not exist. Create an input folder and add .md files.");
      missingFolderError.statusCode = 404;
      throw missingFolderError;
    }
    throw error;
  }

  const report = { generatedFiles: [], skippedFiles: [], errors: [], pages: [] };
  const usedOutputNames = new Set(["index.html"]);

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      report.skippedFiles.push(entry.name);
      continue;
    }

    let markdown;
    try {
      markdown = await fs.readFile(path.join(sourceFolder, entry.name), "utf8");
    } catch {
      report.errors.push(`${entry.name}: unable to read the file`);
      continue;
    }

    const originalStem = entry.name.slice(0, -3);
    let safeStem = originalStem.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!safeStem) {
      safeStem = "document";
    }
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safeStem)) {
      safeStem = `_${safeStem}`;
    }

    const baseName = safeStem;
    let suffix = 2;
    while (usedOutputNames.has(`${safeStem.toLowerCase()}.html`)) {
      safeStem = `${baseName}-${suffix}`;
      suffix += 1;
    }

    const outputName = `${safeStem}.html`;
    if (!isSafeOutputFilename(outputName)) {
      report.errors.push(`${entry.name}: generated filename is not safe`);
      continue;
    }
    usedOutputNames.add(outputName.toLowerCase());
    const outputPath = path.resolve(generatedFolder, outputName);
    if (!outputPath.startsWith(`${generatedFolder}${path.sep}`)) {
      report.errors.push(`${entry.name}: generated filename is outside the output folder`);
      continue;
    }
    const title = escapeHtml(originalStem || "Untitled");
    const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body>
${convertMarkdown(markdown)}
</body>
</html>
`;

    try {
      await fs.writeFile(outputPath, page, "utf8");
      report.generatedFiles.push(outputName);
      report.pages.push({ filename: outputName, title: originalStem || "Untitled" });
    } catch {
      report.errors.push(`${entry.name}: unable to write the output file`);
    }
  }

  try {
    await fs.writeFile(path.join(generatedFolder, "index.html"), createHomepage(report.pages), "utf8");
  } catch {
    report.errors.push("index.html: unable to write the generated homepage");
  }

  return report;
}

async function readGeneratedPages(generatedFolder = outputFolder) {
  let homepage;
  try {
    homepage = await fs.readFile(path.join(generatedFolder, "index.html"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const pages = [];
  const linkPattern = /<li><a href="\.\/([^"]+)">([\s\S]*?)<\/a> <span>\(([^()]*)\)<\/span><\/li>/g;
  let match;
  while ((match = linkPattern.exec(homepage)) !== null) {
    const filename = match[1];
    if (isSafeOutputFilename(filename) && match[3] === filename) {
      const entities = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'"
      };
      const title = match[2].replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => entities[entity]);
      pages.push({ filename, title });
    }
  }

  return pages;
}

async function serveStaticFile(requestPath, response, projectDirectory = projectFolder, generatedFolder = outputFolder) {
  if (requestPath.startsWith("/output/")) {
    const outputName = requestPath.slice("/output/".length);
    if (!/^[a-zA-Z0-9_-]+\.html$/i.test(outputName)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    try {
      const contents = await fs.readFile(path.join(generatedFolder, outputName));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(contents);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error.code === "ENOENT" ? "Not found" : "Unable to read the generated page");
    }
    return;
  }

  const publicFile = publicFiles.get(requestPath);
  if (!publicFile) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const contents = await fs.readFile(path.join(projectDirectory, publicFile[0]));
    response.writeHead(200, { "Content-Type": publicFile[1] });
    response.end(contents);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to read the requested project file");
  }
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readJsonBody(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw createHttpError(415, "Send the request as JSON.");
  }

  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxRequestBodyBytes) {
    throw createHttpError(413, "The request body is too large.");
  }

  const chunks = [];
  let bodyLength = 0;
  for await (const chunk of request) {
    bodyLength += chunk.length;
    if (bodyLength > maxRequestBodyBytes) {
      throw createHttpError(413, "The request body is too large.");
    }
    chunks.push(chunk);
  }

  if (bodyLength === 0) {
    throw createHttpError(400, "A JSON request body is required.");
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw createHttpError(400, "The request body must contain valid JSON.");
  }
}

function parseConversionId(rawId) {
  if (!/^[1-9]\d*$/.test(rawId)) {
    throw createHttpError(400, "Conversion ID must be a positive integer.");
  }

  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) {
    throw createHttpError(400, "Conversion ID must be a positive integer.");
  }
  return id;
}

function reportDatabaseError(response, error, logger) {
  if (error.statusCode) {
    sendJson(response, error.statusCode, { success: false, error: error.message });
    return;
  }

  const errorCode = error.code || "UNKNOWN_DATABASE_ERROR";
  logger.error(`Database operation failed (${errorCode}): ${error.message || "No driver message provided."}`);

  const messages = {
    DB_CONFIG_FILE_MISSING: "The project .env file is missing. Copy .env.example to .env and add your MySQL username and password.",
    DB_CONFIG_MISSING: "DB_USER is missing. Add your MySQL username to the project .env file.",
    DB_CONFIG_INVALID: "DB_PORT is invalid. Set it to a valid port number in .env.",
    ECONNREFUSED: "Cannot connect to MySQL. Confirm the MySQL80 service is running on the configured host and port.",
    ETIMEDOUT: "The MySQL connection timed out. Check the configured host and port.",
    ENOTFOUND: "The configured MySQL host could not be found. Check DB_HOST in .env.",
    ER_ACCESS_DENIED_ERROR: "MySQL rejected the configured username or password. Check DB_USER and DB_PASSWORD in .env.",
    ER_BAD_DB_ERROR: "The markdown_converter database does not exist. Run database/schema.sql in MySQL Workbench or the MySQL CLI.",
    ER_NO_SUCH_TABLE: "The conversions table does not exist. Run database/schema.sql in MySQL Workbench or the MySQL CLI."
  };
  sendJson(response, 503, {
    success: false,
    error: messages[errorCode] || "The database operation failed. Check the backend terminal for the MySQL error code and message.",
    code: errorCode
  });
}

function createServer(options = {}) {
  const projectDirectory = options.projectDirectory || projectFolder;
  const sourceFolder = options.inputDirectory || path.join(projectDirectory, "input");
  const generatedFolder = options.outputDirectory || path.join(projectDirectory, "output");
  const poolProvider = options.getPool || getPool;
  const databaseConnectionCheck = options.testConnection || testConnection;
  const logger = options.logger || console;

  return http.createServer(async (request, response) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    } catch {
      sendJson(response, 400, { success: false, error: "The request URL is invalid." });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/health/db") {
      try {
        const connection = await databaseConnectionCheck();
        sendJson(response, 200, {
          success: true,
          database: connection.databaseName,
          connected: connection.connected === 1
        });
      } catch (error) {
        reportDatabaseError(response, error, logger);
      }
      return;
    }

    if (requestUrl.pathname === "/api/conversions" && request.method === "POST") {
      try {
        const body = await readJsonBody(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw createHttpError(400, "The request body must be a JSON object.");
        }

        if (typeof body.projectName !== "string" || !body.projectName.trim()) {
          throw createHttpError(400, "A conversion name is required.");
        }
        const projectName = body.projectName.trim();
        if (projectName.length > 255) {
          throw createHttpError(400, "The conversion name must be 255 characters or fewer.");
        }
        if (typeof body.markdownContent !== "string" || !body.markdownContent.trim()) {
          throw createHttpError(400, "Markdown content cannot be empty.");
        }

        const generatedHtml = convertMarkdown(body.markdownContent);
        const [result] = await poolProvider().execute(
          "INSERT INTO conversions (project_name, markdown_content, generated_html) VALUES (?, ?, ?)",
          [projectName, body.markdownContent, generatedHtml]
        );
        sendJson(response, 201, {
          success: true,
          id: result.insertId,
          message: "Conversion saved."
        });
      } catch (error) {
        reportDatabaseError(response, error, logger);
      }
      return;
    }

    if (requestUrl.pathname === "/api/conversions" && request.method === "GET") {
      try {
        const [conversions] = await poolProvider().execute(
          "SELECT id, project_name, created_at FROM conversions ORDER BY created_at DESC, id DESC"
        );
        sendJson(response, 200, { success: true, conversions });
      } catch (error) {
        reportDatabaseError(response, error, logger);
      }
      return;
    }

    const conversionRoute = requestUrl.pathname.match(/^\/api\/conversions\/([^/]+)$/);
    if (conversionRoute && (request.method === "GET" || request.method === "DELETE")) {
      let id;
      try {
        id = parseConversionId(conversionRoute[1]);
      } catch (error) {
        reportDatabaseError(response, error, logger);
        return;
      }

      try {
        if (request.method === "GET") {
          const [conversions] = await poolProvider().execute(
            "SELECT id, project_name, markdown_content, generated_html, created_at FROM conversions WHERE id = ?",
            [id]
          );
          if (conversions.length === 0) {
            sendJson(response, 404, { success: false, error: "Conversion not found." });
            return;
          }
          sendJson(response, 200, { success: true, conversion: conversions[0] });
          return;
        }

        const [result] = await poolProvider().execute(
          "DELETE FROM conversions WHERE id = ?",
          [id]
        );
        if (result.affectedRows === 0) {
          sendJson(response, 404, { success: false, error: "Conversion not found." });
          return;
        }
        sendJson(response, 200, { success: true, message: "Conversion deleted." });
      } catch (error) {
        reportDatabaseError(response, error, logger);
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/pages") {
      try {
        sendJson(response, 200, { success: true, pages: await readGeneratedPages(generatedFolder) });
      } catch {
        sendJson(response, 500, { success: false, error: "Generated pages could not be read." });
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/generate") {
      try {
        const report = await generateHtmlFiles(sourceFolder, generatedFolder);
        sendJson(response, 200, {
          success: true,
          generatedFiles: report.generatedFiles,
          skippedFiles: report.skippedFiles,
          errors: report.errors,
          pages: report.pages
        });
      } catch (error) {
        sendJson(response, error.statusCode || 500, {
          success: false,
          generatedFiles: [],
          skippedFiles: [],
          errors: [],
          pages: [],
          error: error.statusCode ? error.message : "The website could not be generated."
        });
      }
      return;
    }

    if (request.method === "GET") {
      await serveStaticFile(requestUrl.pathname, response, projectDirectory, generatedFolder);
      return;
    }

    response.writeHead(405, {
      "Content-Type": "text/plain; charset=utf-8",
      Allow: "GET, POST, DELETE"
    });
    response.end("Method not allowed");
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(port, "127.0.0.1", async () => {
    console.log(`Markdown site generator running at http://localhost:${port}`);
    try {
      const database = await testConnection();
      console.log(`MySQL connected to database "${database.databaseName}".`);
    } catch (error) {
      console.error(`MySQL connection check failed (${error.code || "UNKNOWN_DATABASE_ERROR"}): ${error.message}`);
    }
  });
}

module.exports = { createServer, generateHtmlFiles, readGeneratedPages };
