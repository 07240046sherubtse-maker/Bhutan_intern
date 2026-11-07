
function isEmailConfigured() {
  return Boolean(
    process.env.GOOGLE_APPS_SCRIPT_URL &&
    process.env.GOOGLE_APPS_SCRIPT_SECRET
  );
}

function verificationRequired() {
  if (process.env.EMAIL_VERIFICATION_REQUIRED === "false") {
    return false;
  }

  return process.env.EMAIL_VERIFICATION_REQUIRED === "true" ||
    isEmailConfigured();
}

function validateEmailConfiguration(required = false) {
  if (required && !isEmailConfigured()) {
    throw new Error(
      "Set GOOGLE_APPS_SCRIPT_URL and GOOGLE_APPS_SCRIPT_SECRET to enable email verification."
    );
  }

  if (
    process.env.GOOGLE_APPS_SCRIPT_URL &&
    !process.env.GOOGLE_APPS_SCRIPT_URL.endsWith("/exec")
  ) {
    throw new Error(
      "GOOGLE_APPS_SCRIPT_URL must be your deployed Apps Script /exec URL."
    );
  }
}

function publicBaseUrl() {
  return (
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || 3000}`
  ).replace(/\/+$/, "");
}

async function sendEmail({ to, subject, text }) {
  if (!isEmailConfigured()) {
    throw new Error("Google Apps Script email service is not configured.");
  }

  const response = await fetch(process.env.GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: process.env.GOOGLE_APPS_SCRIPT_SECRET,
      to,
      subject,
      body: text,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Google email service returned HTTP ${response.status}.`
    );
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(
      result.error || "Google Apps Script failed to send the email."
    );
  }

  return result;
}

module.exports = {
  isEmailConfigured,
  publicBaseUrl,
  sendEmail,
  validateEmailConfiguration,
  verificationRequired,
};
