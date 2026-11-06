const crypto = require("node:crypto");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

function hashCode(code) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured to protect email verification and reset codes.");
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

async function issueVerificationToken(client, userId, email) {
  const token = createCode();
  await client.query(
    `INSERT INTO email_verification_tokens (user_id,email,token_hash,expires_at)
     VALUES ($1,$2,$3,NOW() + INTERVAL '10 minutes')
     ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email,token_hash=EXCLUDED.token_hash,
       expires_at=EXCLUDED.expires_at,created_at=NOW()`,
    [userId, email, hashCode(token)],
  );
  return token;
}

async function issuePasswordResetCode(client, userId) {
  const code = createCode();
  await client.query(
    `INSERT INTO password_reset_tokens (user_id,token_hash,expires_at)
     VALUES ($1,$2,NOW() + INTERVAL '15 minutes')
     ON CONFLICT (user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,
       expires_at=EXCLUDED.expires_at,created_at=NOW()`,
    [userId, hashCode(code)],
  );
  return code;
}

module.exports = { createCode, createToken, hashCode, hashToken, issuePasswordResetCode, issueVerificationToken };
