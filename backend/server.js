"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { convertMarkdown, escapeHtml } = require("../markdown");

const projectFolder = path.resolve(__dirname, "..");
const inputFolder = path.join(projectFolder, "input");
const outputFolder = path.join(projectFolder, "output");
const port = Number(process.env.PORT) || 3000;
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

async function generateHtmlFiles() {
  await fs.mkdir(outputFolder, { recursive: true });

  let entries;
  try {
    entries = await fs.readdir(inputFolder, { withFileTypes: true });
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
      markdown = await fs.readFile(path.join(inputFolder, entry.name), "utf8");
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
    const outputPath = path.resolve(outputFolder, outputName);
    if (!outputPath.startsWith(`${outputFolder}${path.sep}`)) {
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
    await fs.writeFile(path.join(outputFolder, "index.html"), createHomepage(report.pages), "utf8");
  } catch {
    report.errors.push("index.html: unable to write the generated homepage");
  }

  return report;
}

async function readGeneratedPages() {
  let homepage;
  try {
    homepage = await fs.readFile(path.join(outputFolder, "index.html"), "utf8");
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

async function serveStaticFile(requestPath, response) {
  if (requestPath.startsWith("/output/")) {
    const outputName = requestPath.slice("/output/".length);
    if (!/^[a-zA-Z0-9_-]+\.html$/i.test(outputName)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    try {
      const contents = await fs.readFile(path.join(outputFolder, outputName));
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
    const contents = await fs.readFile(path.join(projectFolder, publicFile[0]));
    response.writeHead(200, { "Content-Type": publicFile[1] });
    response.end(contents);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to read the requested project file");
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/api/pages") {
    try {
      sendJson(response, 200, { success: true, pages: await readGeneratedPages() });
    } catch {
      sendJson(response, 500, { success: false, error: "Generated pages could not be read." });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/generate") {
    try {
      const report = await generateHtmlFiles();
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
    await serveStaticFile(requestUrl.pathname, response);
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, POST" });
  response.end("Method not allowed");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Markdown site generator running at http://localhost:${port}`);
});
