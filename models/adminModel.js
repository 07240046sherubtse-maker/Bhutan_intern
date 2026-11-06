const { pool } = require("../config/database");

async function listCompanies() {
  const result = await pool.query("SELECT * FROM companies ORDER BY created_at DESC");
  return result.rows;
}

async function findCompanyForEdit(id) {
  const result = await pool.query(
    `SELECT c.*,contact.email AS representative_email,contact.phone AS representative_phone
     FROM companies c LEFT JOIN LATERAL (
       SELECT email,phone FROM company_contacts WHERE company_id=c.id ORDER BY created_at DESC LIMIT 1
     ) contact ON TRUE WHERE c.id=$1`,
    [id],
  );
  return result.rows[0] || null;
}

async function listInternships() {
  const result = await pool.query(
    "SELECT i.*,c.name AS company_name FROM internships i JOIN companies c ON c.id=i.company_id ORDER BY i.created_at DESC",
  );
  return result.rows;
}

async function findInternshipForEdit(id) {
  const result = await pool.query(
    "SELECT i.*,c.name AS company_name FROM internships i JOIN companies c ON c.id=i.company_id WHERE i.id=$1",
    [id],
  );
  return result.rows[0] || null;
}

async function listActiveCompanies() {
  const result = await pool.query(
    "SELECT id,name FROM companies WHERE verification_status='verified' AND partnership_status='active' ORDER BY name",
  );
  return result.rows;
}

async function listCategories() {
  const result = await pool.query("SELECT name FROM internship_categories ORDER BY name");
  return result.rows;
}

async function listApplications(status) {
  const result = await pool.query(
    `SELECT a.id,a.status,a.submitted_at,u.name AS user_name,u.email,i.title AS internship_title,c.name AS company_name
     FROM internship_applications a JOIN users u ON u.id=a.user_id
     JOIN internships i ON i.id=a.internship_id JOIN companies c ON c.id=i.company_id
     WHERE ($1='' OR a.status=$1) ORDER BY a.submitted_at DESC`,
    [status],
  );
  return result.rows;
}

async function findApplication(id) {
  const result = await pool.query(
    `SELECT a.*,u.name AS user_name,u.email,u.phone,i.title,i.id AS internship_id,c.name AS company_name
     FROM internship_applications a JOIN users u ON u.id=a.user_id
     JOIN internships i ON i.id=a.internship_id JOIN companies c ON c.id=i.company_id WHERE a.id=$1`,
    [id],
  );
  return result.rows[0] || null;
}

async function listApplicationDocuments(id) {
  const result = await pool.query(
    "SELECT id,original_name,size_bytes,uploaded_at FROM application_documents WHERE application_id=$1 ORDER BY uploaded_at",
    [id],
  );
  return result.rows;
}

async function listApplicationHistory(id) {
  const result = await pool.query(
    `SELECT h.*,u.name AS changed_by_name FROM application_status_history h
     JOIN users u ON u.id=h.changed_by WHERE h.application_id=$1 ORDER BY h.changed_at DESC`,
    [id],
  );
  return result.rows;
}

async function listUsers() {
  const result = await pool.query(
    `SELECT u.id,u.name,u.email,u.phone,u.is_active,u.created_at,p.dzongkhag,p.education
     FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
     WHERE u.role='user' ORDER BY u.created_at DESC`,
  );
  return result.rows;
}

async function listInternshipRecords() {
  const result = await pool.query(
    `SELECT r.*,u.name AS user_name,u.email,i.title AS internship_title,c.name AS company_name
     FROM internship_records r JOIN users u ON u.id=r.user_id
     JOIN internships i ON i.id=r.internship_id JOIN companies c ON c.id=i.company_id
     ORDER BY r.created_at DESC`,
  );
  return result.rows;
}

async function findCompanyCommunications(id) {
  const [company, logs, documents] = await Promise.all([
    pool.query("SELECT * FROM companies WHERE id=$1", [id]),
    pool.query("SELECT * FROM company_communication_logs WHERE company_id=$1 ORDER BY contact_date DESC", [id]),
    pool.query("SELECT * FROM company_documents WHERE company_id=$1 ORDER BY uploaded_at DESC", [id]),
  ]);
  return { company: company.rows[0] || null, logs: logs.rows, documents: documents.rows };
}

async function listExtensionRequests() {
  const result = await pool.query(
    `SELECT e.*,u.name AS user_name,i.title AS internship_title,r.current_end_date
     FROM extension_requests e JOIN users u ON u.id=e.user_id
     JOIN internship_records r ON r.id=e.record_id JOIN internships i ON i.id=r.internship_id
     ORDER BY e.created_at DESC`,
  );
  return result.rows;
}

async function findAdminProfile(id) {
  const result = await pool.query("SELECT name,email,phone FROM users WHERE id=$1 AND role='admin'", [id]);
  return result.rows[0] || null;
}

module.exports = {
  findAdminProfile,
  findCompanyCommunications,
  findApplication,
  listApplicationDocuments,
  listApplicationHistory,
  findCompanyForEdit,
  findInternshipForEdit,
  listApplications,
  listActiveCompanies,
  listCategories,
  listCompanies,
  listExtensionRequests,
  listInternshipRecords,
  listInternships,
  listUsers,
};
