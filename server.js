require("dotenv").config();

const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { hasDatabaseConfiguration, pool } = require("./config/database");
const { isEmailConfigured, validateEmailConfiguration, verificationRequired } = require("./services/email");
const { discardUpload, validateStorageConfiguration } = require("./services/file-storage");
const { startReminderScheduler } = require("./services/reminders");
const { csrfSynchronisedProtection, generateToken } = require("./middleware/csrf");
const { formatDate, normalizeDateFields, toDateInputValue } = require("./middleware/date-format");
const notificationModel = require("./models/notificationModel");
const webRoutes = require("./routes/web");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");

const app = express();
const PgSession = connectPgSimple(session);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.locals.formatDate = formatDate;
app.locals.toDateInputValue = toDateInputValue;
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(normalizeDateFields);
app.use(express.static(path.join(__dirname, "public"), { index: false }));
app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  name: "internshiplink.sid",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.csrfToken = generateToken(req);
  res.locals.notice = req.session.notice || null;
  delete req.session.notice;
  next();
});
app.use(async (req, res, next) => {
  try {
    const user = req.session.user;
    res.locals.unreadNotificationCount = !user ? 0
      : user.role === "admin"
        ? await notificationModel.countUnreadForAdmin()
        : await notificationModel.countUnreadForUser(user.id);
    next();
  } catch (error) {
    next(error);
  }
});
app.use((req, res, next) => {
  if (req.is("multipart/form-data")) return next();
  csrfSynchronisedProtection(req, res, next);
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: "Too many sign-in attempts. Please try again in 15 minutes.",
});

app.use("/", webRoutes);
app.use("/", authRoutes(loginLimiter));
app.use("/", userRoutes);
app.use("/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).render("errors/404", { title: "Page not found" });
});

app.use((error, req, res, _next) => {
  console.error(error);
  const uploaded = [req.file, ...(Array.isArray(req.files) ? req.files : [])].filter(Boolean);
  for (const file of uploaded) discardUpload(file).catch((cleanupError) => console.error("Could not remove failed upload:", cleanupError));
  const status = error.status || error.statusCode || (error.code === "LIMIT_FILE_SIZE" ? 413 : error.name === "MulterError" ? 400 : 500);
  const message = status >= 500 ? "Something went wrong. Please try again." : error.message;
  if (res.headersSent) return;
  res.status(status).render("errors/error", { title: "Request error", message });
});

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  if (!hasDatabaseConfiguration) {
    throw new Error("Set DATABASE_URL or DB_HOST, DB_USER, and DB_NAME in .env before starting Bhutan InternshipLink.");
  }
  if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    throw new Error("Set a SESSION_SECRET of at least 32 characters in production.");
  }
  if (process.env.NODE_ENV === "production" && (!verificationRequired() || !isEmailConfigured() || !process.env.PUBLIC_BASE_URL)) {
    throw new Error("Production requires EMAIL_VERIFICATION_REQUIRED=true, SMTP_HOST, SMTP_FROM, and PUBLIC_BASE_URL.");
  }
  validateEmailConfiguration(verificationRequired());
  if (process.env.NODE_ENV === "production" && new URL(process.env.PUBLIC_BASE_URL).protocol !== "https:") {
    throw new Error("PUBLIC_BASE_URL must use HTTPS in production.");
  }
  validateStorageConfiguration();
  pool.query("SELECT 1").then(() => {
    app.listen(port, () => {
      const host = process.env.HOST || "localhost";
      const url = `http://${host}:${port}`;
      console.log(`Bhutan InternshipLink is running at ${url}`);
      console.log(`Administrator login: ${url}/admin/login`);
    });
    startReminderScheduler(pool);
  }).catch((error) => {
    console.error("Could not connect to PostgreSQL:", error.message);
    process.exitCode = 1;
    return pool.end();
  });
}

module.exports = app;
