const { pool } = require("../config/database");

async function findSeekerDashboard(userId) {
  const [counts, applications, profile, notifications] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='pending')::int AS pending,
        COUNT(*) FILTER (WHERE status='approved')::int AS approved,
        COUNT(*) FILTER (WHERE status='declined')::int AS declined,
        (SELECT COUNT(*)::int FROM internship_records WHERE user_id=$1 AND status='active') AS active_internships,
        (SELECT COUNT(*)::int FROM extension_requests WHERE user_id=$1) AS extension_requests
       FROM internship_applications WHERE user_id=$1`,
      [userId],
    ),
    pool.query(
      `SELECT a.id,a.status,a.submitted_at,i.id AS internship_id,i.title,c.name AS company_name
       FROM internship_applications a JOIN internships i ON i.id=a.internship_id
       JOIN companies c ON c.id=i.company_id WHERE a.user_id=$1
       ORDER BY a.submitted_at DESC LIMIT 8`,
      [userId],
    ),
    pool.query("SELECT * FROM user_profiles WHERE user_id=$1", [userId]),
    pool.query("SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5", [userId]),
  ]);
  return {
    counts: counts.rows[0],
    applications: applications.rows,
    profile: profile.rows[0],
    notifications: notifications.rows,
  };
}

async function findAdminDashboard() {
  const [users, companies, internships, applications, extensions, records, followups] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role='user' AND is_active"),
    pool.query(
      `SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE verification_status='verified')::int AS verified,
        COUNT(*) FILTER (WHERE verification_status='verified' AND partnership_status='active')::int AS active,
        COUNT(*) FILTER (WHERE partnership_status='inactive')::int AS inactive
       FROM companies`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='published')::int AS published,
        COUNT(*) FILTER (WHERE status='filled')::int AS filled
       FROM internships`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='pending')::int AS pending,
        COUNT(*) FILTER (WHERE status='approved')::int AS approved,
        COUNT(*) FILTER (WHERE status='declined')::int AS declined,
        COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled
       FROM internship_applications`,
    ),
    pool.query("SELECT COUNT(*)::int AS total FROM extension_requests WHERE status='pending'"),
    pool.query("SELECT COUNT(*)::int AS total FROM internship_records WHERE status='active'"),
    pool.query(
      `SELECT c.id,c.name,l.follow_up_date FROM company_communication_logs l
       JOIN companies c ON c.id=l.company_id
       WHERE l.follow_up_date<=CURRENT_DATE AND c.partnership_status<>'archived'
       ORDER BY l.follow_up_date LIMIT 10`,
    ),
  ]);
  return {
    stats: {
      users: users.rows[0],
      companies: companies.rows[0],
      internships: internships.rows[0],
      applications: applications.rows[0],
      extensions: extensions.rows[0],
      records: records.rows[0],
    },
    followups: followups.rows,
  };
}

module.exports = { findAdminDashboard, findSeekerDashboard };
