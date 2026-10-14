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

  const report = { generatedFiles: [], skippedFiles: [], errors: [] };
  const usedOutputNames = new Set();

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
    usedOutputNames.add(outputName.toLowerCase());
    const outputPath = path.join(outputFolder, outputName);
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
    } catch {
      report.errors.push(`${entry.name}: unable to write the output file`);
    }
  }

  return report;
}

async function serveStaticFile(requestPath, response) {
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

  if (request.method === "POST" && requestUrl.pathname === "/api/generate") {
    try {
      const report = await generateHtmlFiles();
      sendJson(response, 200, { success: true, ...report });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        success: false,
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
