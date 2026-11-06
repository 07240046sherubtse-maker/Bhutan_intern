const { pool } = require("../config/database");

async function findOpenInternship(id) {
  const result = await pool.query(
    `SELECT i.*,c.name AS company_name FROM internships i JOIN companies c ON c.id=i.company_id
     WHERE i.id=$1 AND i.status='published' AND c.verification_status='verified'
       AND c.partnership_status='active' AND (i.deadline IS NULL OR i.deadline>=CURRENT_DATE)`,
    [id],
  );
  return result.rows[0] || null;
}

async function hasUserApplied(userId, internshipId) {
  const result = await pool.query(
    "SELECT 1 FROM internship_applications WHERE user_id=$1 AND internship_id=$2",
    [userId, internshipId],
  );
  return result.rowCount > 0;
}

async function findForUser(id, userId) {
  const result = await pool.query(
    `SELECT a.*,i.title,i.id AS internship_id,c.name AS company_name,c.phone AS company_phone
     FROM internship_applications a JOIN internships i ON i.id=a.internship_id
     JOIN companies c ON c.id=i.company_id WHERE a.id=$1 AND a.user_id=$2`,
    [id, userId],
  );
  return result.rows[0] || null;
}

async function findEditableForUser(id, userId) {
  const result = await pool.query(
    `SELECT a.*,i.title,i.id AS internship_id,c.name AS company_name
     FROM internship_applications a JOIN internships i ON i.id=a.internship_id
     JOIN companies c ON c.id=i.company_id
     WHERE a.id=$1 AND a.user_id=$2 AND a.status='pending'`,
    [id, userId],
  );
  return result.rows[0] || null;
}

async function findDocumentForUser(id, userId) {
  const result = await pool.query(
    `SELECT d.* FROM application_documents d
     JOIN internship_applications a ON a.id=d.application_id
     WHERE d.id=$1 AND a.user_id=$2`,
    [id, userId],
  );
  return result.rows[0] || null;
}

async function listDocumentsForApplication(id) {
  const result = await pool.query(
    "SELECT id,original_name,size_bytes,uploaded_at FROM application_documents WHERE application_id=$1 ORDER BY uploaded_at",
    [id],
  );
  return result.rows;
}

async function listDocumentsForUserApplication(id, userId) {
  const result = await pool.query(
    `SELECT d.id,d.original_name,d.size_bytes,d.uploaded_at
     FROM application_documents d JOIN internship_applications a ON a.id=d.application_id
     WHERE a.id=$1 AND a.user_id=$2 ORDER BY d.uploaded_at`,
    [id, userId],
  );
  return result.rows;
}

module.exports = {
  findDocumentForUser,
  findEditableForUser,
  findForUser,
  findOpenInternship,
  hasUserApplied,
  listDocumentsForApplication,
  listDocumentsForUserApplication,
};
