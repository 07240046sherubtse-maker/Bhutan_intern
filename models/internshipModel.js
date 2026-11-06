const { pool } = require("../config/database");

async function listPublished(filters) {
  const { q = "", category = "", company_id = "", dzongkhag = "", type = "", arrangement = "", duration = "", education = "", stipend = "" } = filters;
  const companyId = /^\d{1,18}$/.test(String(company_id)) ? String(company_id) : "";
  const [internships, categories, companies] = await Promise.all([
    pool.query(
      `SELECT i.id,i.title,i.category,i.internship_type,i.dzongkhag,i.stipend_nu,i.duration,i.deadline,c.name AS company_name
       FROM internships i JOIN companies c ON c.id=i.company_id
       WHERE i.status='published' AND (i.deadline IS NULL OR i.deadline>=CURRENT_DATE)
         AND c.verification_status='verified' AND c.partnership_status='active'
         AND ($1='' OR i.title ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%')
         AND ($2='' OR i.category=$2)
         AND ($3='' OR c.id=$3::bigint)
         AND ($4='' OR i.dzongkhag ILIKE '%' || $4 || '%')
         AND ($5='' OR i.internship_type=$5)
         AND ($6='' OR i.work_arrangement=$6)
         AND ($7='' OR i.duration ILIKE '%' || $7 || '%')
         AND ($8='' OR i.qualifications ILIKE '%' || $8 || '%')
         AND ($9='' OR ($9='paid' AND i.stipend_nu>0) OR ($9='unpaid' AND (i.stipend_nu IS NULL OR i.stipend_nu=0)))
       ORDER BY i.created_at DESC`,
      [
        String(q).slice(0, 100),
        String(category).slice(0, 100),
        companyId,
        String(dzongkhag).slice(0, 100),
        String(type).slice(0, 30),
        String(arrangement).slice(0, 20),
        String(duration).slice(0, 100),
        String(education).slice(0, 100),
        ["paid", "unpaid"].includes(stipend) ? stipend : "",
      ],
    ),
    pool.query("SELECT name FROM internship_categories ORDER BY name"),
    pool.query(
      `SELECT id,name FROM companies
       WHERE verification_status='verified' AND partnership_status='active'
       ORDER BY name`,
    ),
  ]);
  return { internships: internships.rows, categories: categories.rows, companies: companies.rows };
}

async function findPublishedById(id) {
  const result = await pool.query(
    `SELECT i.*,c.name AS company_name,c.description AS company_description,c.dzongkhag AS company_dzongkhag
     FROM internships i JOIN companies c ON c.id=i.company_id
     WHERE i.id=$1 AND i.status='published' AND (i.deadline IS NULL OR i.deadline>=CURRENT_DATE)
       AND c.verification_status='verified' AND c.partnership_status='active'`,
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

async function listFeatured(limit = 6) {
  const result = await pool.query(
    `SELECT i.id,i.title,i.category,i.internship_type,i.dzongkhag,i.stipend_nu,c.name AS company_name
     FROM internships i JOIN companies c ON c.id=i.company_id
     WHERE i.status='published' AND (i.deadline IS NULL OR i.deadline>=CURRENT_DATE)
       AND c.verification_status='verified' AND c.partnership_status='active'
     ORDER BY i.created_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows;
}

module.exports = { findPublishedById, hasUserApplied, listFeatured, listPublished };
