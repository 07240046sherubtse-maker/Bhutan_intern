const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");
const express = require("express");
const { S3Client } = require("@aws-sdk/client-s3");
const { pool } = require("../config/database");
const { uploadDirectory } = require("../middleware/upload");
const { formatDate, normalizeDateFields, toDateInputValue } = require("../middleware/date-format");
const { hashCode, issueVerificationToken } = require("../services/tokens");
const fileStorage = require("../services/file-storage");

test("admin, user, and public routers load with valid controller handlers", () => {
  assert.equal(typeof require("../routes/admin"), "function");
  assert.equal(typeof require("../routes/user"), "function");
  assert.equal(typeof require("../routes/web"), "function");
});

test("date helpers display and accept DD/MM/YYYY while validating real calendar dates", () => {
  assert.equal(formatDate("2025-03-07"), "07/03/2025");
  assert.equal(toDateInputValue("2025-03-07"), "07/03/2025");

  const req = { body: {
    date_of_birth: "07/03/2025",
    deadline: "29/02/2025",
    start_date: "2025-03-07",
    note: "07/03/2025",
  } };
  normalizeDateFields(req, {}, () => {});

  assert.equal(req.body.date_of_birth, "2025-03-07");
  assert.equal(req.body.deadline, "29/02/2025");
  assert.equal(req.body.start_date, "2025-03-07");
  assert.equal(req.body.note, "07/03/2025");
});

test("user application queries include company phone and restrict editing to pending owner applications", async () => {
  const { listApplications } = require("../models/userModel");
  const { findEditableForUser } = require("../models/applicationModel");
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [] };
  };
  try {
    await listApplications("42");
    await findEditableForUser("17", "42");
    assert.match(calls[0].sql, /c\.phone AS company_phone/);
    assert.deepEqual(calls[0].values, ["42"]);
    assert.match(calls[1].sql, /a\.user_id=\$2 AND a\.status='pending'/);
    assert.deepEqual(calls[1].values, ["17", "42"]);
  } finally {
    pool.query = originalQuery;
  }
});

test("verification codes are six digits and stored only as keyed hashes", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret";
  const calls = [];
  try {
    const code = await issueVerificationToken({ query: async (...args) => calls.push(args) }, "14", "person@example.com");
    assert.match(code, /^\d{6}$/);
    assert.notEqual(calls[0][1][2], code);
    assert.equal(calls[0][1][2], hashCode(code));
    assert.match(calls[0][0], /10 minutes/);
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("email codes are six digits and stored as keyed hashes", () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret";
  try {
    const { createCode } = require("../services/tokens");
    const code = createCode();
    assert.match(code, /^\d{6}$/);
    assert.match(hashCode(code), /^[a-f0-9]{64}$/);
    assert.notEqual(hashCode(code), code);
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("Gmail environment settings configure outbound mail and verification", () => {
  const keys = ["EMAIL_USER", "EMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_VERIFICATION_REQUIRED"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.EMAIL_USER = "sender@example.com";
    process.env.EMAIL_APP_PASSWORD = "not-a-real-password";
    const email = require("../services/email");
    assert.equal(email.isEmailConfigured(), true);
    assert.equal(email.verificationRequired(), true);
    email.validateEmailConfiguration(true);
    process.env.EMAIL_VERIFICATION_REQUIRED = "false";
    assert.equal(email.verificationRequired(), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("notification unread counts are scoped to the signed-in role", async () => {
  const {
    countUnreadForAdmin,
    countUnreadForUser,
    markAllReadForAdmin,
    markAllReadForUser,
  } = require("../models/notificationModel");
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{ count: calls.length }] };
  };
  try {
    assert.equal(await countUnreadForUser("14"), 1);
    assert.equal(await countUnreadForAdmin(), 2);
    assert.deepEqual(calls.map(({ values }) => values), [["14"], undefined]);
    assert.match(calls[0].sql, /user_id=\$1 AND read_at IS NULL/);
    assert.match(calls[1].sql, /role_target='admin' AND read_at IS NULL/);
    await markAllReadForUser("14");
    await markAllReadForAdmin();
    assert.match(calls[2].sql, /UPDATE notifications SET read_at=NOW\(\) WHERE user_id=\$1 AND read_at IS NULL/);
    assert.deepEqual(calls[2].values, ["14"]);
    assert.match(calls[3].sql, /UPDATE notifications SET read_at=NOW\(\) WHERE role_target='admin' AND read_at IS NULL/);
  } finally {
    pool.query = originalQuery;
  }
});

test("public internship controller applies every supported filter safely", async () => {
  const originalQuery = pool.query;
  const statements = [];
  pool.query = async (sql, values) => {
    statements.push({ sql, values });
    return { rows: [] };
  };
  try {
    const internshipController = require("../controllers/internshipController");
    const response = {
      render(view, data) {
        this.view = view;
        this.data = data;
      },
    };
    await internshipController.list(
      { query: { q: "analyst", category: "Finance", company_id: "17", dzongkhag: "Thimphu", type: "short-term", arrangement: "hybrid", duration: "2 months", education: "degree", stipend: "paid" } },
      response,
    );
    assert.equal(response.view, "internships/index");
    assert.match(statements[0].sql, /deadline IS NULL OR i\.deadline>=CURRENT_DATE/);
    assert.match(statements[0].sql, /verification_status='verified'/);
    assert.deepEqual(statements[0].values, ["analyst", "Finance", "17", "Thimphu", "short-term", "hybrid", "2 months", "degree", "paid"]);
    assert.equal(statements[1].sql, "SELECT name FROM internship_categories ORDER BY name");
    assert.match(statements[2].sql, /verification_status='verified' AND partnership_status='active'/);
  } finally {
    pool.query = originalQuery;
  }
});

test("local and S3-compatible uploads can be stored, read, and discarded", async () => {
  const environment = Object.fromEntries([
    "S3_ENDPOINT", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY",
    "S3_FORCE_PATH_STYLE", "S3_KEY_PREFIX",
  ].map((key) => [key, process.env[key]]));
  const s3Send = S3Client.prototype.send;
  const files = [];
  try {
    for (const key of Object.keys(environment)) delete process.env[key];
    const localName = `${crypto.randomUUID()}.upload`;
    const localPath = path.join(uploadDirectory, localName);
    await fs.writeFile(localPath, "local fixture");
    const localFile = { filename: localName, path: localPath, mimetype: "text/plain" };
    files.push(localFile);
    assert.equal(await fileStorage.persistUpload(localFile), localName);
    assert.equal((await streamText(await fileStorage.openStoredFile(localName))), "local fixture");
    await fileStorage.discardUpload(localFile);
    await assert.rejects(fs.access(localPath));

    process.env.S3_ENDPOINT = "https://objects.example.test";
    process.env.S3_BUCKET = "internship-private";
    process.env.S3_REGION = "auto";
    process.env.S3_ACCESS_KEY_ID = "test-access";
    process.env.S3_SECRET_ACCESS_KEY = "test-secret";
    process.env.S3_KEY_PREFIX = "private-uploads/";
    const commands = [];
    S3Client.prototype.send = async function (command) {
      commands.push(command);
      if (command.constructor.name === "PutObjectCommand") {
        const chunks = [];
        for await (const chunk of command.input.Body) chunks.push(chunk);
        assert.equal(Buffer.concat(chunks).toString(), "cloud fixture");
        return {};
      }
      if (command.constructor.name === "GetObjectCommand") return { Body: Readable.from([Buffer.from("cloud fixture")]) };
      return {};
    };
    const cloudName = `${crypto.randomUUID()}.upload`;
    const cloudPath = path.join(uploadDirectory, cloudName);
    await fs.writeFile(cloudPath, "cloud fixture");
    const cloudFile = { filename: cloudName, path: cloudPath, mimetype: "text/plain" };
    files.push(cloudFile);
    const storedName = await fileStorage.persistUpload(cloudFile);
    assert.match(storedName, /^s3:private-uploads\//);
    assert.equal((await streamText(await fileStorage.openStoredFile(storedName))), "cloud fixture");
    await fileStorage.discardUpload(cloudFile);
    assert.deepEqual(commands.map((command) => command.constructor.name), ["PutObjectCommand", "GetObjectCommand", "DeleteObjectCommand"]);
    await assert.rejects(fs.access(cloudPath));
  } finally {
    S3Client.prototype.send = s3Send;
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
  }
});

test("registration and password reset use the expected transactional database paths", async (t) => {
  const previousVerificationSetting = process.env.EMAIL_VERIFICATION_REQUIRED;
  const previousSessionSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.EMAIL_VERIFICATION_REQUIRED = "false";
  const originalConnect = pool.connect;
  const calls = [];
  let nextMode = "registration";
  let resetPasswordHash;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO users") && nextMode === "registration") return { rows: [{ id: "14" }] };
      if (sql.includes("UPDATE users u SET email_verified_at") && nextMode === "email-verification") {
        return { rows: [{ id: "14", email: "person@example.com" }], rowCount: 1 };
      }
      if (sql.includes("SELECT user_id FROM password_reset_tokens")) return { rows: [{ user_id: "14" }], rowCount: 1 };
      if (sql.includes("UPDATE users SET password_hash")) resetPasswordHash = values[0];
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  pool.connect = async () => client;

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = {};
    res.locals.currentUser = null;
    res.locals.csrfToken = "test-token";
    res.locals.notice = null;
    next();
  });
  app.use("/", require("../routes/auth")((_req, _res, next) => next()));
  app.use((error, _req, res, _next) => res.status(500).send(error.message));
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const registration = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        name: "Test User",
        email: "person@example.com",
        phone: "1234567",
        password: "example-password",
        confirmPassword: "example-password",
      }),
      redirect: "manual",
    });
    assert.equal(registration.status, 302);
    assert.ok(calls.some(({ sql }) => sql.includes("CASE WHEN $5 THEN NULL ELSE NOW() END")));
    assert.ok(calls.some(({ sql }) => sql === "COMMIT"));

    calls.length = 0;
    nextMode = "email-verification";
    process.env.EMAIL_VERIFICATION_REQUIRED = "true";
    const verification = await fetch(`${baseUrl}/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "person@example.com", code: "123456" }),
      redirect: "manual",
    });
    assert.equal(verification.status, 302);
    assert.equal(new URL(verification.headers.get("location"), baseUrl).pathname, "/login");
    assert.equal(calls.find(({ sql }) => sql.includes("UPDATE users u SET email_verified_at")).values[0], hashCode("123456"));
    assert.ok(calls.some(({ sql }) => sql.includes("DELETE FROM email_verification_tokens")));
    assert.ok(calls.some(({ sql }) => sql === "COMMIT"));

    calls.length = 0;
    nextMode = "password-reset";
    process.env.EMAIL_VERIFICATION_REQUIRED = "false";
    const reset = await fetch(`${baseUrl}/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "person@example.com", code: "654321", password: "reset-password-new", confirmPassword: "reset-password-new" }),
      redirect: "manual",
    });
    assert.equal(reset.status, 302);
    assert.equal(new URL(reset.headers.get("location"), baseUrl).pathname, "/login");
    assert.equal(calls.find(({ sql }) => sql.includes("SELECT user_id FROM password_reset_tokens")).values[0], hashCode("654321"));
    assert.ok(resetPasswordHash);
    assert.ok(calls.some(({ sql }) => sql.includes("DELETE FROM user_sessions")));
    assert.ok(calls.some(({ sql }) => sql === "COMMIT"));
  } finally {
    pool.connect = originalConnect;
    if (previousVerificationSetting === undefined) delete process.env.EMAIL_VERIFICATION_REQUIRED;
    else process.env.EMAIL_VERIFICATION_REQUIRED = previousVerificationSetting;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
  }
});

async function streamText(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
}
