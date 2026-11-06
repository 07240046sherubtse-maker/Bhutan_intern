const { pool } = require("../config/database");

async function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).render("errors/403", { title: "Access denied" });
  }
  const result = await pool.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND is_active=TRUE", [req.session.user.id]);
  if (!result.rowCount) {
    await destroySession(req);
    return res.status(403).render("errors/403", { title: "Access denied" });
  }
  next();
}

async function requireUser(req, res, next) {
  if (!req.session.user || req.session.user.role !== "user") {
    return res.status(403).render("errors/403", { title: "Access denied" });
  }
  const result = await pool.query("SELECT 1 FROM users WHERE id=$1 AND role='user' AND is_active=TRUE", [req.session.user.id]);
  if (!result.rowCount) {
    await destroySession(req);
    res.clearCookie("internshiplink.sid");
    return res.redirect("/login");
  }
  next();
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => error ? reject(error) : resolve());
  });
}

module.exports = { requireAdmin, requireUser };
