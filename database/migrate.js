require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { hasDatabaseConfiguration, pool } = require("../config/database");

async function migrate() {
  if (!hasDatabaseConfiguration) throw new Error("Set DATABASE_URL or DB_HOST, DB_USER, and DB_NAME before running the database migration.");
  const sql = await fs.readFile(path.join(__dirname, "schema.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Database schema is ready.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
