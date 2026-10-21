"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createServer } = require("./server");

function createFakePool() {
  const records = [];
  const queries = [];
  let nextId = 1;

  return {
    records,
    queries,
    async execute(sql, parameters = []) {
      queries.push({ sql, parameters });

      if (sql.startsWith("INSERT INTO conversions")) {
        const [projectName, markdownContent, generatedHtml] = parameters;
        const id = nextId;
        nextId += 1;
        records.push({
          id,
          project_name: projectName,
          markdown_content: markdownContent,
          generated_html: generatedHtml,
          created_at: new Date().toISOString()
        });
        return [{ insertId: id }, []];
      }

      if (sql.includes("ORDER BY created_at")) {
        return [records.map(({ id, project_name, created_at }) => ({
          id,
          project_name,
          created_at
        })), []];
      }

      if (sql.includes("WHERE id = ?")) {
        const record = records.find((item) => item.id === parameters[0]);
        if (sql.startsWith("DELETE")) {
          if (!record) {
            return [{ affectedRows: 0 }, []];
          }
          records.splice(records.indexOf(record), 1);
          return [{ affectedRows: 1 }, []];
        }
        return [record ? [{ ...record }] : [], []];
      }

      throw new Error("Unexpected SQL in fake pool.");
    }
  };
}

async function withServer(options, callback) {
  const server = createServer(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("conversion API saves, lists, loads, and deletes parameterized records", async () => {
  const pool = createFakePool();
  const markdownContent = '# Viva\n\nA **saved** conversion.';

  await withServer({ getPool: () => pool, logger: { error() {} } }, async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/conversions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "Viva project", markdownContent })
    });
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.equal(created.success, true);
    assert.equal(created.id, 1);
    assert.equal(pool.records[0].markdown_content, markdownContent);
    assert.match(pool.records[0].generated_html, /<h1>Viva<\/h1>/);
    assert.match(pool.records[0].generated_html, /<strong>saved<\/strong>/);
    assert.match(pool.queries[0].sql, /VALUES \(\?, \?, \?\)/);
    assert.deepEqual(pool.queries[0].parameters, [
      "Viva project",
      markdownContent,
      pool.records[0].generated_html
    ]);

    const listResponse = await fetch(`${baseUrl}/api/conversions`);
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.deepEqual(Object.keys(list.conversions[0]).sort(), ["created_at", "id", "project_name"]);

    const detailResponse = await fetch(`${baseUrl}/api/conversions/1`);
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.conversion.markdown_content, markdownContent);
    assert.equal(detail.conversion.generated_html, pool.records[0].generated_html);

    const missingResponse = await fetch(`${baseUrl}/api/conversions/99`);
    assert.equal(missingResponse.status, 404);

    const deleteResponse = await fetch(`${baseUrl}/api/conversions/1`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 200);
    assert.equal(pool.records.length, 0);

    const deleteMissingResponse = await fetch(`${baseUrl}/api/conversions/1`, { method: "DELETE" });
    assert.equal(deleteMissingResponse.status, 404);
    assert.ok(pool.queries.slice(1).every((query) =>
      query.sql.includes("WHERE id = ?") || query.sql.startsWith("SELECT")
    ));
  });
});

test("conversion API rejects empty input, invalid names, and invalid IDs", async () => {
  const pool = createFakePool();

  await withServer({ getPool: () => pool, logger: { error() {} } }, async (baseUrl) => {
    for (const body of [
      { projectName: "Valid name", markdownContent: " \n " },
      { projectName: "  ", markdownContent: "# Content" },
      { projectName: "x".repeat(256), markdownContent: "# Content" }
    ]) {
      const response = await fetch(`${baseUrl}/api/conversions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).success, false);
    }

    for (const id of ["0", "-1", "not-an-id", "9007199254740992"]) {
      const response = await fetch(`${baseUrl}/api/conversions/${id}`);
      assert.equal(response.status, 400);
    }
    assert.equal(pool.queries.length, 0);
  });
});

test("database failures return a safe service-unavailable response", async () => {
  const loggedErrors = [];
  await withServer({
    getPool() {
      const error = new Error("Access denied for user 'example'@'localhost'.");
      error.code = "ER_ACCESS_DENIED_ERROR";
      throw error;
    },
    logger: { error(...parts) { loggedErrors.push(parts.join(" ")); } }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/conversions`);
    const result = await response.json();
    assert.equal(response.status, 503);
    assert.equal(result.success, false);
    assert.equal(result.code, "ER_ACCESS_DENIED_ERROR");
    assert.match(result.error, /username or password/);
    assert.doesNotMatch(JSON.stringify(result), /Access denied for user/);
    assert.match(loggedErrors.join("\n"), /ER_ACCESS_DENIED_ERROR.*Access denied for user/);
  });
});

test("database health endpoint verifies the configured database and schema", async () => {
  await withServer({
    testConnection: async () => ({ databaseName: "markdown_converter", connected: 1 }),
    logger: { error() {} }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/db`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      database: "markdown_converter",
      connected: true
    });
  });
});

test("database health endpoint reports missing table without exposing driver internals", async () => {
  const loggedErrors = [];
  await withServer({
    testConnection: async () => {
      const error = new Error("Table 'markdown_converter.conversions' doesn't exist");
      error.code = "ER_NO_SUCH_TABLE";
      throw error;
    },
    logger: { error(...parts) { loggedErrors.push(parts.join(" ")); } }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/db`);
    const result = await response.json();
    assert.equal(response.status, 503);
    assert.equal(result.code, "ER_NO_SUCH_TABLE");
    assert.match(result.error, /database\/schema.sql/);
    assert.doesNotMatch(JSON.stringify(result), /markdown_converter\.conversions/);
    assert.match(loggedErrors.join("\n"), /ER_NO_SUCH_TABLE.*markdown_converter\.conversions/);
  });
});

test("existing file generation and generated-page endpoints remain operational", async () => {
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-generator-"));
  const inputDirectory = path.join(projectDirectory, "input");
  await fs.mkdir(inputDirectory);
  await fs.writeFile(path.join(inputDirectory, "sample.md"), "# Generated\n\nWorks.", "utf8");

  try {
    await withServer({ projectDirectory, logger: { error() {} } }, async (baseUrl) => {
      const generateResponse = await fetch(`${baseUrl}/api/generate`, { method: "POST" });
      const report = await generateResponse.json();
      assert.equal(generateResponse.status, 200);
      assert.deepEqual(report.generatedFiles, ["sample.html"]);
      assert.equal(report.pages[0].title, "sample");

      const pagesResponse = await fetch(`${baseUrl}/api/pages`);
      const pages = await pagesResponse.json();
      assert.deepEqual(pages.pages, report.pages);

      const htmlResponse = await fetch(`${baseUrl}/output/sample.html`);
      assert.match(await htmlResponse.text(), /<h1>Generated<\/h1>/);
      const homepage = await fs.readFile(path.join(projectDirectory, "output", "index.html"), "utf8");
      assert.match(homepage, /sample\.html/);
    });
  } finally {
    await fs.rm(projectDirectory, { recursive: true, force: true });
  }
});
