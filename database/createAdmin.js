require("dotenv").config();

const readline = require("node:readline/promises");
const fs = require("node:fs/promises");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { hasDatabaseConfiguration, pool } = require("../config/database");

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
      return reject(new Error("Run this command in an interactive terminal so the password can be entered without echo."));
    }
    process.stdout.write(prompt);
    let value = "";
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          process.stdout.write("\n");
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", onData);
          reject(new Error("Admin setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          process.stdout.write("\n");
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", onData);
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function main() {
  if (!hasDatabaseConfiguration) throw new Error("Set DATABASE_URL or DB_HOST, DB_USER, and DB_NAME in .env before creating an administrator.");
  const configuredPassword = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  if (configuredPassword) {
    const envPath = path.join(__dirname, "..", ".env");
    const envContents = await fs.readFile(envPath, "utf8");
    await fs.writeFile(envPath, envContents.replace(/^\s*ADMIN_PASSWORD\s*=.*(?:\r?\n|$)/gm, ""), "utf8");
  }
  let prompt;
  const ask = async (label, currentValue) => {
    if (currentValue) return currentValue;
    prompt ||= readline.createInterface({ input: process.stdin, output: process.stdout });
    return (await prompt.question(label)).trim();
  };
  try {
    const name = await ask("Administrator name: ", process.env.ADMIN_NAME?.trim());
    const email = (await ask("Email address: ", process.env.ADMIN_EMAIL?.trim())).toLowerCase();
    const phone = await ask("Phone number: ", process.env.ADMIN_PHONE?.trim());

    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length < 5) {
      throw new Error("Enter a valid name, email address and phone number.");
    }
    prompt?.close();
    const password = configuredPassword || await readHidden("Password (minimum 12 characters): ");
    if (password.length < 12 || password.length > 128) {
      throw new Error("Administrator passwords must be between 12 and 128 characters.");
    }

    const hash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(593102)");
      const count = await client.query("SELECT COUNT(*)::int AS total FROM users WHERE role='admin'");
      if (count.rows[0].total >= 2) throw new Error("The platform already has two administrator accounts.");
      await client.query(
        "INSERT INTO users (name,email,phone,password_hash,role,email_verified_at) VALUES ($1,$2,$3,$4,'admin',NOW())",
        [name, email, phone, hash],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    console.log("Administrator account created.");
  } finally {
    prompt?.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
