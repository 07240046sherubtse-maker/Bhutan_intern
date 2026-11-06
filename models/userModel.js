const { pool } = require("../config/database");

async function findProfile(userId) {
  const result = await pool.query(
    `SELECT u.name,u.email,u.phone,u.email_verified_at,p.*
     FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function findApplicationProfile(userId) {
  const result = await pool.query(
    `SELECT u.name,u.email,u.phone,p.* FROM users u
     LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function listApplications(userId) {
  const result = await pool.query(
    `SELECT a.*,i.title,i.id AS internship_id,c.name AS company_name,c.phone AS company_phone
     FROM internship_applications a JOIN internships i ON i.id=a.internship_id
     JOIN companies c ON c.id=i.company_id WHERE a.user_id=$1
     ORDER BY a.submitted_at DESC`,
    [userId],
  );
  return result.rows;
}

async function listInternships(userId) {
  const result = await pool.query(
    `SELECT r.*,i.title,c.name AS company_name,i.dzongkhag
     FROM internship_records r JOIN internships i ON i.id=r.internship_id
     JOIN companies c ON c.id=i.company_id WHERE r.user_id=$1
     ORDER BY r.created_at DESC`,
    [userId],
  );
  return result.rows;
}

async function listDocuments(userId) {
  const result = await pool.query(
    `SELECT d.id,d.original_name,d.size_bytes,d.uploaded_at,i.title
     FROM application_documents d JOIN internship_applications a ON a.id=d.application_id
     JOIN internships i ON i.id=a.internship_id WHERE d.user_id=$1
     ORDER BY d.uploaded_at DESC`,
    [userId],
  );
  return result.rows;
}

module.exports = { findApplicationProfile, findProfile, listApplications, listDocuments, listInternships };
