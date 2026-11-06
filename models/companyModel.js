const { pool } = require("../config/database");

async function listPublished() {
  const result = await pool.query(
    `SELECT c.id,c.name,c.description,c.industry,c.dzongkhag,c.logo_stored_name,COUNT(i.id)::int AS internship_count
     FROM companies c LEFT JOIN internships i ON i.company_id=c.id AND i.status='published'
       AND (i.deadline IS NULL OR i.deadline>=CURRENT_DATE)
     WHERE c.verification_status='verified' AND c.partnership_status='active'
     GROUP BY c.id ORDER BY c.name`,
  );
  return result.rows;
}

async function findPublishedById(id) {
  const result = await pool.query(
    "SELECT * FROM companies WHERE id=$1 AND verification_status='verified' AND partnership_status='active'",
    [id],
  );
  return result.rows[0] || null;
}

async function findPublishedLogo(id) {
  const result = await pool.query(
    `SELECT logo_stored_name,logo_mime_type FROM companies
     WHERE id=$1 AND verification_status='verified' AND partnership_status='active'
       AND logo_stored_name IS NOT NULL AND logo_mime_type IN ('image/jpeg','image/png')`,
    [id],
  );
  return result.rows[0] || null;
}

async function listPublishedInternships(companyId) {
  const result = await pool.query(
    "SELECT * FROM internships WHERE company_id=$1 AND status='published' AND (deadline IS NULL OR deadline>=CURRENT_DATE) ORDER BY created_at DESC",
    [companyId],
  );
  return result.rows;
}

module.exports = { findPublishedById, findPublishedLogo, listPublished, listPublishedInternships };
