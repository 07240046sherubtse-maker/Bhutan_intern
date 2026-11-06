const express = require("express");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const { pool } = require("../config/database");
const { isEmailConfigured, sendEmail, verificationRequired } = require("../services/email");
const { hashCode, issuePasswordResetCode, issueVerificationToken } = require("../services/tokens");
const authController = require("../controllers/authController");

const router = express.Router();

function isGuest(req, res, next) {
  if (req.session.user) return res.redirect(req.session.user.role === "admin" ? "/admin" : "/dashboard");
  next();
}

async function sendVerificationEmail(email, code) {
  await sendEmail({
    to: email,
    subject: "Your Bhutan InternshipLink verification code",
    text: `Your six-digit verification code is ${code}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`,
  });
}

async function sendPasswordResetCode(email, code) {
  await sendEmail({
    to: email,
    subject: "Your Bhutan InternshipLink password reset code",
    text: `Your six-digit password reset code is ${code}. It expires in 15 minutes. If you did not request a password reset, you can ignore this email.`,
  });
}

function loginRoutes(limiter) {
  router.get("/register", isGuest, (_req, res) => res.render("auth/register", { title: "Create an account" }));
  router.post("/register", isGuest, [
    body("name").trim().isLength({ min: 2, max: 120 }),
    body("email").trim().isEmail().normalizeEmail(),
    body("phone").trim().isLength({ min: 5, max: 40 }),
    body("password").isLength({ min: 10, max: 128 }),
    body("confirmPassword").custom((value, { req }) => value === req.body.password),
  ], (req, res, next) => {
    if (validationResult(req).isEmpty()) return next();
    req.session.notice = "Please enter valid details and use a password with at least 10 characters.";
    return res.redirect("/register");
  }, authController.register);

  router.get("/login", isGuest, (req, res) => {
    const role = req.query.role === "admin" ? "admin" : "user";
    res.render("auth/login", { title: "Sign in", role });
  });
  router.get("/admin/login", isGuest, (_req, res) => res.redirect("/login?role=admin"));

  const credentials = [
    body("email").trim().isEmail().isLength({ max: 254 }),
    body("password").isLength({ min: 1, max: 128 }),
    (req, res, next) => {
      if (validationResult(req).isEmpty()) return next();
      req.session.notice = "Please enter a valid email address and password.";
      return res.redirect(req.path === "/admin/login" ? "/login?role=admin" : "/login");
    },
  ];
  router.post("/login", limiter, isGuest, body("role").isIn(["user", "admin"]), credentials, authController.signIn());
  router.post("/admin/login", limiter, isGuest, credentials, authController.signIn("admin"));

  router.get("/verify-email", isGuest, (req, res) => {
    const email = String(req.query.email || "").trim().toLowerCase();
    res.render("auth/verify-email", { title: "Verify email", email });
  });

  router.post("/verify-email", limiter, isGuest, [
    body("email").trim().isEmail().isLength({ max: 254 }).normalizeEmail(),
    body("code").matches(/^\d{6}$/),
  ], async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      req.session.notice = "Enter the email address and six-digit verification code.";
      return res.redirect("/login");
    }
    const email = req.body.email;
    const code = req.body.code;
    const client = await pool.connect();
    let userId;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE users u SET email_verified_at=NOW(),updated_at=NOW()
         FROM email_verification_tokens t
         WHERE t.user_id=u.id AND t.email=u.email AND t.token_hash=$1
           AND t.email=$2 AND t.expires_at>NOW() AND u.is_active=TRUE
         RETURNING u.id,u.email`,
        [hashCode(code), email],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        req.session.notice = "The verification code is invalid or expired. Request a new code and try again.";
        return res.redirect(`/verify-email?email=${encodeURIComponent(email)}`);
      }
      userId = result.rows[0].id;
      await client.query("DELETE FROM email_verification_tokens WHERE user_id=$1", [userId]);
      await client.query("COMMIT");
      if (req.session.user && String(req.session.user.id) === String(userId)) req.session.user.email = result.rows[0].email;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    req.session.notice = "Email verified. You can now sign in.";
    res.redirect("/login");
  });

  router.post("/email/verification/resend", limiter, async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    req.session.notice = "If the account needs verification, a new six-digit code will be sent.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !verificationRequired()) return res.redirect("/login");
    const client = await pool.connect();
    let token;
    try {
      await client.query("BEGIN");
      const account = await client.query("SELECT id,email,email_verified_at FROM users WHERE email=$1 AND role='user' AND is_active=TRUE FOR UPDATE", [email]);
      if (account.rowCount && !account.rows[0].email_verified_at) {
        token = await issueVerificationToken(client, account.rows[0].id, account.rows[0].email);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    if (token) {
      try {
        await sendVerificationEmail(email, token);
      } catch (error) {
        console.error("Verification email could not be sent:", error);
        req.session.notice = "If the account needs verification, a new six-digit code will be sent.";
      }
    }
    res.redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  });

  router.get("/forgot-password", isGuest, (_req, res) => res.render("auth/forgot-password", { title: "Reset password" }));

  router.post("/forgot-password", limiter, isGuest, body("email").trim().isEmail().isLength({ max: 254 }), async (req, res) => {
    req.session.notice = "If an active account uses that address, a six-digit reset code will be sent.";
    if (!validationResult(req).isEmpty()) return res.redirect("/forgot-password");
    if (!isEmailConfigured()) {
      req.session.notice = "Password recovery is unavailable because outbound email is not configured.";
      return res.redirect("/forgot-password");
    }
    const email = req.body.email.trim().toLowerCase();
    const account = await pool.query("SELECT id,email FROM users WHERE email=$1 AND is_active=TRUE", [email]);
    if (account.rowCount) {
      try {
        const code = await issuePasswordResetCode(pool, account.rows[0].id);
        await sendPasswordResetCode(account.rows[0].email, code);
      } catch (error) {
        console.error("Password reset email could not be sent:", error);
      }
    }
    res.redirect(`/reset-password?email=${encodeURIComponent(email)}`);
  });

  router.get("/reset-password", isGuest, (req, res) => {
    const email = String(req.query.email || "").trim().toLowerCase();
    res.render("auth/reset-password", { title: "Choose a new password", email });
  });

  router.post("/reset-password", limiter, isGuest, [
    body("email").trim().isEmail().isLength({ max: 254 }).normalizeEmail(),
    body("code").matches(/^\d{6}$/),
    body("password").isLength({ min: 10, max: 128 }),
    body("confirmPassword").custom((value, { req }) => value === req.body.password),
  ], async (req, res) => {
    if (!validationResult(req).isEmpty()) {
      req.session.notice = "Enter the email and six-digit reset code, then choose a matching password of at least 10 characters.";
      return res.redirect("/forgot-password");
    }
    const email = req.body.email;
    const code = req.body.code;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const reset = await client.query(
        `SELECT user_id FROM password_reset_tokens
         WHERE token_hash=$1 AND expires_at>NOW()
           AND user_id=(SELECT id FROM users WHERE email=$2 AND is_active=TRUE)
         FOR UPDATE`,
        [hashCode(code), email],
      );
      if (!reset.rowCount) {
        await client.query("ROLLBACK");
        req.session.notice = "The reset code is invalid or expired. Request a new code and try again.";
        return res.redirect(`/reset-password?email=${encodeURIComponent(email)}`);
      }
      const userId = reset.rows[0].user_id;
      await client.query("UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2", [await bcrypt.hash(req.body.password, 12), userId]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM user_sessions WHERE sess->'user'->>'id'=$1", [String(userId)]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    req.session.notice = "Password reset. Sign in with your new password.";
    res.redirect("/login");
  });

  router.post("/logout", async (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie("internshiplink.sid");
      res.redirect("/");
    });
  });

  return router;
}

module.exports = loginRoutes;
