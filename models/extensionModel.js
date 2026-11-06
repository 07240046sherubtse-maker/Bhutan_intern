const { pool } = require("../config/database");

async function listForUser(userId) {
  const result = await pool.query(
    `SELECT r.id AS record_id,r.current_end_date,r.status AS internship_status,i.title,c.name AS company_name,
      e.id AS request_id,e.additional_duration,e.proposed_end_date,e.reason,e.status AS request_status,
      e.admin_comment,e.created_at
     FROM internship_records r JOIN internships i ON i.id=r.internship_id
     JOIN companies c ON c.id=i.company_id
     LEFT JOIN LATERAL (
       SELECT x.id,x.additional_duration,x.proposed_end_date,x.reason,x.status,x.admin_comment,x.created_at
       FROM extension_requests x WHERE x.record_id=r.id ORDER BY x.created_at DESC LIMIT 1
     ) e ON TRUE
     WHERE r.user_id=$1 ORDER BY r.created_at DESC,e.created_at DESC`,
    [userId],
  );
  return result.rows;
}

async function listForAdmin() {
  const result = await pool.query(
    `SELECT e.*,u.name AS user_name,i.title AS internship_title,r.current_end_date
     FROM extension_requests e JOIN users u ON u.id=e.user_id
     JOIN internship_records r ON r.id=e.record_id JOIN internships i ON i.id=r.internship_id
     ORDER BY e.created_at DESC`,
  );
  return result.rows;
}

module.exports = { listForAdmin, listForUser };
