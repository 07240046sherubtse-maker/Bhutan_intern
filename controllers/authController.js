const bcrypt = require("bcryptjs");
const { pool } = require("../config/database");
const { isEmailConfigured, sendEmail, verificationRequired } = require("../services/email");
const { issueVerificationToken } = require("../services/tokens");

async function sendVerificationEmail(email, token) {
  await sendEmail({
    to: email,
    subject: "Your Bhutan InternshipLink verification code",
    text: `Your email verification code is ${token}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`,
  });
}

async function register(req, res) {
  const client = await pool.connect();
  let clientReleased = false;
  try {
    await client.query("BEGIN");
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const result = await client.query(
      `INSERT INTO users (name,email,phone,password_hash,email_verified_at)
       VALUES ($1,$2,$3,$4,CASE WHEN $5 THEN NULL ELSE NOW() END) RETURNING id`,
      [req.body.name, req.body.email, req.body.phone, passwordHash, verificationRequired()],
    );
    await client.query("INSERT INTO user_profiles (user_id) VALUES ($1)", [result.rows[0].id]);
    await client.query(
      "INSERT INTO notifications (role_target,message) VALUES ('admin',$1)",
      [`New user registration: ${req.body.name}`],
    );
    const verificationToken = verificationRequired()
      ? await issueVerificationToken(client, result.rows[0].id, req.body.email)
      : null;
    await client.query("COMMIT");
    client.release();
    clientReleased = true;

    if (verificationToken) {
      try {
        if (!isEmailConfigured()) throw new Error("Email verification is required but SMTP is not configured.");
        await sendVerificationEmail(req.body.email, verificationToken);
        req.session.notice = "Account created. Enter the six-digit code sent to your email to verify your account.";
      } catch (error) {
        console.error("Verification email could not be sent:", error);
        req.session.notice = "Account created, but the verification code could not be sent. You can request another code.";
      }
    } else {
      req.session.notice = "Your account has been created. Please sign in.";
    }
    res.redirect(verificationToken ? `/verify-email?email=${encodeURIComponent(req.body.email)}` : "/login");
  } catch (error) {
    if (!clientReleased) {
      await client.query("ROLLBACK").catch((rollbackError) => console.error("Could not roll back registration:", rollbackError));
    }
    if (error.code === "23505") {
      req.session.notice = "An account with that email already exists.";
      return res.redirect("/register");
    }
    throw error;
  } finally {
    if (!clientReleased) client.release();
  }
}

function signIn(expectedRole = null) {
  return async (req, res) => {
    const role = expectedRole || (["user", "admin"].includes(req.body.role) ? req.body.role : null);
    if (!role) {
      req.session.notice = "Choose whether to sign in as a user or administrator.";
      return res.redirect("/login");
    }
    const email = String(req.body.email || "").trim().toLowerCase();
    const result = await pool.query(
      "SELECT id,name,email,password_hash,role,is_active,email_verified_at FROM users WHERE email=$1 AND role=$2",
      [email, role],
    );
    const account = result.rows[0];
    if (!account || !account.is_active || !(await bcrypt.compare(String(req.body.password || ""), account.password_hash))) {
      req.session.notice = "Email or password is incorrect.";
      return res.redirect(role === "admin" ? "/login?role=admin" : "/login");
    }
    if (role === "user" && verificationRequired() && !account.email_verified_at) {
      req.session.notice = "Verify your email before signing in. Use the resend link to request a new verification email.";
      return res.redirect("/login");
    }
    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.user = { id: account.id, name: account.name, email: account.email, role: account.role };
    req.session.notice = "Welcome back.";
    res.redirect(role === "admin" ? "/admin" : "/dashboard");
  };
}

module.exports = { register, signIn };
