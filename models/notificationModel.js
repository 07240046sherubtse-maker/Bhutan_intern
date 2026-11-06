const { pool } = require("../config/database");

async function listForUser(userId, limit = 100) {
  const result = await pool.query(
    "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit],
  );
  return result.rows;
}

async function listForAdmin(limit = 100) {
  const result = await pool.query(
    "SELECT * FROM notifications WHERE role_target='admin' ORDER BY created_at DESC LIMIT $1",
    [limit],
  );
  return result.rows;
}

async function countUnreadForUser(userId) {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL",
    [userId],
  );
  return result.rows[0].count;
}

async function countUnreadForAdmin() {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS count FROM notifications WHERE role_target='admin' AND read_at IS NULL",
  );
  return result.rows[0].count;
}

async function markReadForUser(id, userId) {
  return pool.query("UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2", [id, userId]);
}

async function markReadForAdmin(id) {
  return pool.query("UPDATE notifications SET read_at=NOW() WHERE id=$1 AND role_target='admin'", [id]);
}

async function markAllReadForUser(userId) {
  return pool.query(
    "UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL",
    [userId],
  );
}

async function markAllReadForAdmin() {
  return pool.query(
    "UPDATE notifications SET read_at=NOW() WHERE role_target='admin' AND read_at IS NULL",
  );
}

module.exports = {
  countUnreadForAdmin,
  countUnreadForUser,
  listForAdmin,
  listForUser,
  markAllReadForAdmin,
  markAllReadForUser,
  markReadForAdmin,
  markReadForUser,
};
