const { pool } = require("../config/database");

async function summary() {
  const [applications, categories, regions, totals] = await Promise.all([
    pool.query("SELECT status,COUNT(*)::int AS count FROM internship_applications GROUP BY status ORDER BY status"),
    pool.query("SELECT category,COUNT(*)::int AS count FROM internships GROUP BY category ORDER BY count DESC"),
    pool.query(
      "SELECT COALESCE(dzongkhag,'Not specified') AS dzongkhag,COUNT(*)::int AS count FROM internship_applications GROUP BY dzongkhag ORDER BY count DESC LIMIT 20",
    ),
    pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE role='user' AND is_active) AS users,
         (SELECT COUNT(*)::int FROM companies WHERE verification_status='verified' AND partnership_status='active') AS companies,
         (SELECT COUNT(*)::int FROM internships WHERE status='published') AS internships,
         (SELECT COUNT(*)::int FROM internship_applications) AS applications`,
    ),
  ]);
  return { applications: applications.rows, categories: categories.rows, regions: regions.rows, totals: totals.rows[0] };
}

async function applicationsCsv() {
  const result = await pool.query(
    `SELECT u.name,u.email,i.title AS internship,c.name AS company,a.status,a.submitted_at,a.dzongkhag
     FROM internship_applications a JOIN users u ON u.id=a.user_id
     JOIN internships i ON i.id=a.internship_id JOIN companies c ON c.id=i.company_id
     ORDER BY a.submitted_at DESC`,
  );
  return result.rows;
}

module.exports = { applicationsCsv, summary };
