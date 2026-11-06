const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
const hasDatabaseConfiguration = Boolean(
  databaseUrl || (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME),
);

let connection;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  for (const option of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    parsed.searchParams.delete(option);
  }
  connection = { connectionString: parsed.toString() };
} else if (hasDatabaseConfiguration) {
  connection = {
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  };
}

const pool = new Pool({
  ...connection,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

module.exports = { hasDatabaseConfiguration, pool };
