const nodemailer = require("nodemailer");

function isEmailConfigured() {
  return Boolean((process.env.SMTP_HOST || process.env.EMAIL_USER) && (process.env.SMTP_FROM || process.env.EMAIL_USER));
}

function verificationRequired() {
  if (process.env.EMAIL_VERIFICATION_REQUIRED === "false") return false;
  return process.env.EMAIL_VERIFICATION_REQUIRED === "true" || isEmailConfigured();
}

function validateEmailConfiguration(required = false) {
  const username = process.env.SMTP_USER || process.env.EMAIL_USER;
  const password = process.env.SMTP_PASSWORD || process.env.EMAIL_APP_PASSWORD;
  if (Boolean(username) !== Boolean(password)) throw new Error("Set both SMTP_USER and SMTP_PASSWORD, or leave both blank.");
  if (required && !isEmailConfigured()) throw new Error("SMTP_HOST and SMTP_FROM must be configured when email verification is required.");
  if (process.env.SMTP_PORT && (!/^\d+$/.test(process.env.SMTP_PORT) || Number(process.env.SMTP_PORT) > 65535 || Number(process.env.SMTP_PORT) < 1)) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");
}

let transporter;

function getTransporter() {
  if (!isEmailConfigured()) throw new Error("SMTP_HOST and SMTP_FROM must be configured to send email.");
  if (!transporter) {
    const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT must be a valid TCP port.");
    const username = process.env.SMTP_USER || process.env.EMAIL_USER;
    const password = process.env.SMTP_PASSWORD || process.env.EMAIL_APP_PASSWORD;
    const auth = username || password
      ? { user: username || "", pass: password || "" }
      : undefined;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth,
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, text }) {
  await getTransporter().sendMail({ from: process.env.SMTP_FROM || process.env.EMAIL_USER, to, subject, text });
}

module.exports = { isEmailConfigured, publicBaseUrl, sendEmail, validateEmailConfiguration, verificationRequired };
