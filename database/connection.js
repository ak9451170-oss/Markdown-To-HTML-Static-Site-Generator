"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
dotenv.config({ path: envPath, quiet: true });

let pool;

function getPool() {
  if (pool) {
    return pool;
  }

  if (!fs.existsSync(envPath) && !process.env.DB_USER) {
    const error = new Error(`Database configuration file not found: ${envPath}`);
    error.code = "DB_CONFIG_FILE_MISSING";
    throw error;
  }

  const missingVariables = ["DB_USER"]
    .filter((name) => !process.env[name]?.trim());
  if (missingVariables.length > 0) {
    const error = new Error("Database configuration is incomplete.");
    error.code = "DB_CONFIG_MISSING";
    throw error;
  }

  const port = Number(process.env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error("Database port configuration is invalid.");
    error.code = "DB_CONFIG_INVALID";
    throw error;
  }

  pool = mysql.createPool({
    host: (process.env.DB_HOST || "localhost").trim(),
    port,
    user: process.env.DB_USER.trim(),
    password: process.env.DB_PASSWORD || "",
    database: (process.env.DB_NAME || "markdown_converter").trim(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4"
  });

  return pool;
}

async function testConnection() {
  const activePool = getPool();
  const connection = await activePool.getConnection();
  try {
    const [rows] = await connection.query("SELECT DATABASE() AS databaseName, 1 AS connected");
    await connection.query("SELECT 1 FROM conversions LIMIT 0");
    return rows[0];
  } finally {
    connection.release();
  }
}

async function closePool() {
  if (pool) {
    const activePool = pool;
    pool = undefined;
    await activePool.end();
  }
}

module.exports = { getPool, testConnection, closePool, envPath };
