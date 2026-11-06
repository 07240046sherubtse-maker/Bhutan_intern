const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/database");
const { requireAdmin } = require("../middleware/auth");
const { validateId } = require("../middleware/ids");
const { normalizeDateFields } = require("../middleware/date-format");
const { upload, hasAllowedSignature } = require("../middleware/upload");
const { csrfSynchronisedProtection } = require("../middleware/csrf");
const { discardUpload, openStoredFile, persistUpload } = require("../services/file-storage");
const adminController = require("../controllers/adminController");

const router = express.Router();
router.param("id", validateId);
router.use(requireAdmin);

async function validateCompanyLogo(req, res, next) {
  if (!req.file) return next();
  const extension = path.extname(req.file.originalname).toLowerCase();
  const allowed = [".jpg", ".jpeg", ".png"];
  if (!allowed.includes(extension) || !(await hasAllowedSignature(req.file.path, extension))) {
    await fs.unlink(req.file.path).catch((error) => console.error(error));
    return res.status(400).render("errors/error", { title: "Invalid logo", message: "Company logos must be valid JPG or PNG images." });
  }
  req.logoMimeType = extension === ".png" ? "image/png" : "image/jpeg";
  next();
}

async function validateCompanyDocument(req, res, next) {
  if (!req.file) return next();
  const extension = path.extname(req.file.originalname).toLowerCase();
  if (!(await hasAllowedSignature(req.file.path, extension))) {
    await fs.unlink(req.file.path).catch((error) => console.error(error));
    return res.status(400).render("errors/error", { title: "Invalid document", message: "The uploaded file does not match an allowed document type." });
  }
  next();
}

router.get("/", adminController.dashboard);

router.get("/companies", adminController.companies);

router.get("/companies/new", adminController.newCompany);

router.get("/companies/:id/edit", adminController.editCompany);

router.post("/companies/:id/edit", upload.single("logo"), csrfSynchronisedProtection, validateCompanyLogo, [
  body("name").trim().isLength({ min: 2, max: 180 }),
  body("description").trim().isLength({ max: 5000 }),
  body("website").trim().isLength({ max: 300 }).custom((value) => {
    if (!value) return true;
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  }),
  body("email").optional({ values: "falsy" }).isEmail(),
  body("representative_email").optional({ values: "falsy" }).isEmail(),
  body("verification_status").isIn(["pending", "verified", "rejected"]),
  body("partnership_status").isIn(["active", "inactive", "archived"]),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    if (req.file) await discardUpload(req.file).catch((error) => console.error("Could not remove rejected upload:", error));
    req.session.notice = "Please check the company details and status values.";
    return res.redirect(`/admin/companies/${req.params.id}/edit`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const storedLogo = req.file ? await persistUpload(req.file) : "";
    const updated = await client.query(
      `UPDATE companies SET name=$1,description=$2,industry=$3,address=$4,dzongkhag=$5,email=NULLIF($6,''),
       phone=NULLIF($7,''),website=NULLIF($8,''),representative=NULLIF($9,''),verification_status=$10,
       partnership_status=$11,logo_stored_name=COALESCE(NULLIF($12,''),logo_stored_name),
       logo_mime_type=COALESCE(NULLIF($13,''),logo_mime_type),updated_at=NOW() WHERE id=$14 RETURNING id`,
      [req.body.name, req.body.description || "", req.body.industry || "", req.body.address || "", req.body.dzongkhag || "", req.body.email || "", req.body.phone || "", req.body.website || "", req.body.representative || "", req.body.verification_status, req.body.partnership_status, storedLogo, req.logoMimeType || "", req.params.id],
    );
    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      if (req.file) await discardUpload(req.file);
      return res.status(404).render("errors/404", { title: "Company not found" });
    }
    if (req.body.representative) {
      const contact = await client.query("SELECT id FROM company_contacts WHERE company_id=$1 ORDER BY created_at DESC LIMIT 1", [req.params.id]);
      if (contact.rowCount) {
        await client.query("UPDATE company_contacts SET name=$1,email=NULLIF($2,''),phone=NULLIF($3,'') WHERE id=$4", [req.body.representative, req.body.representative_email || "", req.body.representative_phone || "", contact.rows[0].id]);
      } else {
        await client.query("INSERT INTO company_contacts (company_id,name,email,phone) VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''))", [req.params.id, req.body.representative, req.body.representative_email || "", req.body.representative_phone || ""]);
      }
    }
    await client.query("INSERT INTO company_partnerships (company_id,status,confirmed_at,notes,created_by) VALUES ($1,$2,CASE WHEN $2='active' THEN CURRENT_DATE ELSE NULL END,'Company details updated.',$3)", [req.params.id, req.body.partnership_status, req.session.user.id]);
    await client.query("INSERT INTO admin_activity_logs (admin_id,action,target_type,target_id,details) VALUES ($1,'edited','company',$2,$3)", [req.session.user.id, req.params.id, req.body.name]);
    await client.query("COMMIT");
    req.session.notice = "Company details updated.";
    res.redirect("/admin/companies");
  } catch (error) {
    await client.query("ROLLBACK");
    if (req.file) await discardUpload(req.file).catch((cleanupError) => console.error("Could not remove failed company logo upload:", cleanupError));
    throw error;
  } finally {
    client.release();
  }
});

router.post("/companies", upload.single("logo"), csrfSynchronisedProtection, validateCompanyLogo, [
  body("name").trim().isLength({ min: 2, max: 180 }),
  body("description").trim().isLength({ max: 5000 }),
  body("website").trim().isLength({ max: 300 }).custom((value) => {
    if (!value) return true;
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  }),
  body("email").optional({ values: "falsy" }).isEmail(),
  body("representative_email").optional({ values: "falsy" }).isEmail(),
  body("verification_status").isIn(["pending", "verified", "rejected"]),
  body("partnership_status").isIn(["active", "inactive", "archived"]),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    if (req.file) await discardUpload(req.file).catch((error) => console.error("Could not remove rejected upload:", error));
    req.session.notice = "Please check the company details and status values.";
    return res.redirect("/admin/companies/new");
  }
  const client = await pool.connect();
  let companyId;
  try {
    await client.query("BEGIN");
    const storedLogo = req.file ? await persistUpload(req.file) : "";
    const result = await client.query(
      `INSERT INTO companies (name,description,industry,address,dzongkhag,email,phone,website,representative,verification_status,partnership_status,logo_stored_name,logo_mime_type)
       VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),$10,$11,NULLIF($12,''),NULLIF($13,'')) RETURNING id`,
      [req.body.name, req.body.description || "", req.body.industry || "", req.body.address || "", req.body.dzongkhag || "", req.body.email || "", req.body.phone || "", req.body.website || "", req.body.representative || "", req.body.verification_status, req.body.partnership_status, storedLogo, req.logoMimeType || ""],
    );
    companyId = result.rows[0].id;
    if (req.body.representative) {
      await client.query(
        "INSERT INTO company_contacts (company_id,name,email,phone,is_public) VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),FALSE)",
        [companyId, req.body.representative, req.body.representative_email || "", req.body.representative_phone || ""],
      );
    }
    await client.query(
      "INSERT INTO company_partnerships (company_id,status,confirmed_at,notes,created_by) VALUES ($1,$2,CASE WHEN $2='active' THEN CURRENT_DATE ELSE NULL END,$3,$4)",
      [companyId, req.body.partnership_status, req.body.partnership_status === "active" ? "Participation confirmed by administrator at company creation." : "", req.session.user.id],
    );
    await client.query("INSERT INTO admin_activity_logs (admin_id,action,target_type,target_id,details) VALUES ($1,'created','company',$2,$3)", [req.session.user.id, companyId, req.body.name]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (req.file) await discardUpload(req.file).catch((cleanupError) => console.error("Could not remove failed company logo upload:", cleanupError));
    throw error;
  } finally {
    client.release();
  }
  req.session.notice = "Company saved. Only verified, active companies appear publicly.";
  res.redirect("/admin/companies");
});

router.post("/companies/:id/status", async (req, res) => {
  const allowedVerification = ["pending", "verified", "rejected"];
  const allowedPartnership = ["active", "inactive", "archived"];
  if (!allowedVerification.includes(req.body.verification_status) || !allowedPartnership.includes(req.body.partnership_status)) {
    req.session.notice = "Choose valid verification and partnership statuses.";
    return res.redirect("/admin/companies");
  }
  const verification = req.body.verification_status;
  const partnership = req.body.partnership_status;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query("UPDATE companies SET verification_status=$1,partnership_status=$2,updated_at=NOW() WHERE id=$3 RETURNING id", [verification, partnership, req.params.id]);
    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).render("errors/404", { title: "Company not found" });
    }
    await client.query(
      "INSERT INTO company_partnerships (company_id,status,confirmed_at,notes,created_by) VALUES ($1,$2,CASE WHEN $2='active' THEN CURRENT_DATE ELSE NULL END,'Partnership status updated by administrator.',$3)",
      [req.params.id, partnership, req.session.user.id],
    );
    await client.query("INSERT INTO admin_activity_logs (admin_id,action,target_type,target_id,details) VALUES ($1,'updated status','company',$2,$3)", [req.session.user.id, req.params.id, `${verification}/${partnership}`]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  req.session.notice = "Company status updated.";
  res.redirect("/admin/companies");
});

router.get("/companies/:id/communications", adminController.companyCommunications);

router.post("/companies/:id/communications", upload.single("supporting_document"), normalizeDateFields, csrfSynchronisedProtection, validateCompanyDocument, [
  body("details").trim().isLength({ min: 2, max: 10000 }),
  body("method").isIn(["phone", "email", "in_person", "other"]),
  body("contact_date").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("follow_up_date").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("confirmation_date").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("available_positions").optional({ values: "falsy" }).isInt({ min: 0 }),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    if (req.file) await discardUpload(req.file).catch((error) => console.error("Could not remove rejected upload:", error));
    req.session.notice = "Please provide a contact method and communication details.";
    return res.redirect(`/admin/companies/${req.params.id}/communications`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const company = await client.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [req.params.id]);
    if (!company.rowCount) {
      await client.query("ROLLBACK");
      if (req.file) await discardUpload(req.file);
      return res.status(404).render("errors/404", { title: "Company not found" });
    }
    const storedDocument = req.file ? await persistUpload(req.file) : "";
    const communication = await client.query(
      `INSERT INTO company_communication_logs (company_id,admin_id,contact_date,method,person_contacted,details,confirmed_opportunities,available_positions,follow_up_date)
       VALUES ($1,$2,COALESCE(NULLIF($3,'')::date,CURRENT_DATE),$4,NULLIF($5,''),$6,NULLIF($7,''),NULLIF($8,'')::int,NULLIF($9,'')::date) RETURNING id`,
      [req.params.id, req.session.user.id, req.body.contact_date || "", req.body.method, req.body.person_contacted || "", req.body.details, req.body.confirmed_opportunities || "", req.body.available_positions || "", req.body.follow_up_date || ""],
    );
    if (req.body.confirmation_date) {
      await client.query("UPDATE companies SET last_confirmation_date=$1,updated_at=NOW() WHERE id=$2", [req.body.confirmation_date, req.params.id]);
    }
    if (req.file) {
      await client.query(
        `INSERT INTO company_documents (company_id,communication_id,uploaded_by,original_name,stored_name,mime_type,size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, communication.rows[0].id, req.session.user.id, path.basename(req.file.originalname).slice(0, 200), storedDocument, req.file.mimetype, req.file.size],
      );
    }
    await client.query("INSERT INTO admin_activity_logs (admin_id,action,target_type,target_id,details) VALUES ($1,'recorded communication','company',$2,$3)", [req.session.user.id, req.params.id, req.body.method]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (req.file) await discardUpload(req.file).catch((cleanupError) => console.error("Could not remove failed company document upload:", cleanupError));
    throw error;
  } finally {
    client.release();
  }
  req.session.notice = "Company communication recorded.";
  res.redirect(`/admin/companies/${req.params.id}/communications`);
});

router.get("/internships", adminController.internships);

router.get("/internships/new", adminController.newInternship);

router.post("/internships", [
  body("company_id").isInt({ min: 1 }),
  body("title").trim().isLength({ min: 3, max: 200 }),
  body("description").trim().isLength({ min: 10, max: 12000 }),
  body("internship_type").isIn(["short-term", "long-term", "vacation", "part-time", "full-time", "flexible"]),
  body("work_arrangement").isIn(["on-site", "remote", "hybrid"]),
  body("status").isIn(["draft", "pending_confirmation", "published"]),
  body("positions").isInt({ min: 1, max: 10000 }),
  body("stipend_nu").optional({ values: "falsy" }).isFloat({ min: 0, max: 10000000 }),
  body("start_date").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("end_date").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("deadline").optional({ values: "falsy" }).isISO8601({ strict: true }),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Please check the internship details.";
    return res.redirect("/admin/internships/new");
  }
  const company = await pool.query("SELECT id FROM companies WHERE id=$1 AND verification_status='verified' AND partnership_status='active'", [req.body.company_id]);
  if (!company.rowCount) {
    req.session.notice = "Select a verified and active company before adding an internship.";
    return res.redirect("/admin/internships/new");
  }
  if (req.body.status === "published" && req.body.availability_confirmed !== "true") {
    req.session.notice = "Confirm internship availability with the host company before publishing.";
    return res.redirect("/admin/internships/new");
  }
  const result = await pool.query(
    `INSERT INTO internships (company_id,title,description,category,qualifications,skills,positions,stipend_nu,location,dzongkhag,gewog,
     internship_type,work_arrangement,working_hours,duration,start_date,end_date,deadline,required_documents,status,last_confirmed_at,last_confirmed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,'')::numeric,$9,$10,$11,$12,$13,$14,$15,NULLIF($16,'')::date,NULLIF($17,'')::date,NULLIF($18,'')::date,$19,$20,
       CASE WHEN $20='published' THEN CURRENT_DATE ELSE NULL END,CASE WHEN $20='published' THEN $21::bigint ELSE NULL END)
     RETURNING id`,
    [req.body.company_id, req.body.title, req.body.description, req.body.category || "Other", req.body.qualifications || "", req.body.skills || "", Number.parseInt(req.body.positions, 10), req.body.stipend_nu || "", req.body.location || "", req.body.dzongkhag || "", req.body.gewog || "", req.body.internship_type, req.body.work_arrangement, req.body.working_hours || "", req.body.duration || "", req.body.start_date || "", req.body.end_date || "", req.body.deadline || "", req.body.required_documents || "", req.body.status, req.session.user.id],
  );
  await logActivity(req, "created", "internship", result.rows[0].id, req.body.title);
  req.session.notice = "Internship listing saved.";
  res.redirect("/admin/internships");
});

router.get("/internships/:id/edit", adminController.editInternship);

router.post("/internships/:id/edit", [
  body("title").trim().isLength({ min: 3, max: 200 }),
  body("description").trim().isLength({ min: 10, max: 12000 }),
  body("internship_type").isIn(["short-term", "long-term", "vacation", "part-time", "full-time", "flexible"]),
  body("work_arrangement").isIn(["on-site", "remote", "hybrid"]),
  body("status").isIn(["draft", "pending_confirmation", "published", "paused", "filled", "expired", "archived"]),
  body("positions").isInt({ min: 1, max: 10000 }),
  body("stipend_nu").optional({ values: "falsy" }).isFloat({ min: 0, max: 10000000 }),
  body("start_date").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("end_date").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("deadline").optional({ values: "falsy" }).isISO8601({ strict: true }),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Please check the internship details.";
    return res.redirect(`/admin/internships/${req.params.id}/edit`);
  }
  if (req.body.status === "published" && req.body.availability_confirmed !== "true") {
    req.session.notice = "Confirm internship availability with the host company before publishing.";
    return res.redirect(`/admin/internships/${req.params.id}/edit`);
  }
  const result = await pool.query(
    `UPDATE internships SET title=$1,description=$2,category=$3,qualifications=$4,skills=$5,positions=$6,
     stipend_nu=NULLIF($7,'')::numeric,location=$8,dzongkhag=$9,gewog=$10,internship_type=$11,work_arrangement=$12,
     working_hours=$13,duration=$14,start_date=NULLIF($15,'')::date,end_date=NULLIF($16,'')::date,
     deadline=NULLIF($17,'')::date,required_documents=$18,status=$19,
     last_confirmed_at=CASE WHEN $19='published' THEN CURRENT_DATE ELSE last_confirmed_at END,
     last_confirmed_by=CASE WHEN $19='published' THEN $20 ELSE last_confirmed_by END,updated_at=NOW()
     WHERE id=$21 RETURNING id`,
    [req.body.title, req.body.description, req.body.category || "Other", req.body.qualifications || "", req.body.skills || "", Number.parseInt(req.body.positions, 10), req.body.stipend_nu || "", req.body.location || "", req.body.dzongkhag || "", req.body.gewog || "", req.body.internship_type, req.body.work_arrangement, req.body.working_hours || "", req.body.duration || "", req.body.start_date || "", req.body.end_date || "", req.body.deadline || "", req.body.required_documents || "", req.body.status, req.session.user.id, req.params.id],
  );
  if (!result.rowCount) return res.status(404).render("errors/404", { title: "Internship not found" });
  await logActivity(req, "edited", "internship", req.params.id, req.body.title);
  req.session.notice = "Internship details updated.";
  res.redirect("/admin/internships");
});

router.post("/internships/:id/status", async (req, res) => {
  const allowed = ["draft", "pending_confirmation", "published", "paused", "filled", "expired", "archived"];
  if (!allowed.includes(req.body.status)) {
    req.session.notice = "Invalid internship status.";
    return res.redirect("/admin/internships");
  }
  if (req.body.status === "published" && req.body.availability_confirmed !== "true") {
    req.session.notice = "Confirm internship availability with the host company before publishing.";
    return res.redirect("/admin/internships");
  }
  if (req.body.status === "published") {
    await pool.query("UPDATE internships SET status=$1,last_confirmed_at=CURRENT_DATE,last_confirmed_by=$2,updated_at=NOW() WHERE id=$3", [req.body.status, req.session.user.id, req.params.id]);
  } else {
    await pool.query("UPDATE internships SET status=$1,updated_at=NOW() WHERE id=$2", [req.body.status, req.params.id]);
  }
  await logActivity(req, "changed internship status", "internship", req.params.id, req.body.status);
  req.session.notice = "Internship status updated.";
  res.redirect("/admin/internships");
});

router.get("/applications", adminController.applications);

router.get("/applications/:id", adminController.application);

router.post("/applications/:id/status", [
  body("status").isIn(["pending", "approved", "declined"]),
  body("admin_notes").trim().isLength({ max: 5000 }),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Please choose a valid application status.";
    return res.redirect(`/admin/applications/${req.params.id}`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT a.*,i.start_date AS internship_start_date,i.end_date AS internship_end_date,i.title FROM internship_applications a
       JOIN internships i ON i.id=a.internship_id WHERE a.id=$1 FOR UPDATE OF a`,
      [req.params.id],
    );
    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).render("errors/404", { title: "Application not found" });
    }
    const application = found.rows[0];
    if (application.status === "cancelled" || (application.status !== "pending" && application.status !== req.body.status)) {
      await client.query("ROLLBACK");
      req.session.notice = "Only pending applications can receive a new decision.";
      return res.redirect(`/admin/applications/${req.params.id}`);
    }
    await client.query("UPDATE internship_applications SET status=$1,admin_notes=$2,updated_at=NOW() WHERE id=$3", [req.body.status, req.body.admin_notes || "", req.params.id]);
    if (application.status !== req.body.status) {
      await client.query(
        "INSERT INTO application_status_history (application_id,changed_by,old_status,new_status,note) VALUES ($1,$2,$3,$4,$5)",
        [req.params.id, req.session.user.id, application.status, req.body.status, req.body.admin_notes || ""],
      );
    }
    if (req.body.status === "approved") {
      await client.query(
        `INSERT INTO internship_records (application_id,user_id,internship_id,actual_start_date,original_end_date,current_end_date)
         VALUES ($1,$2,$3,NULL,$4,$4) ON CONFLICT (application_id) DO NOTHING`,
        [req.params.id, application.user_id, application.internship_id, application.internship_end_date],
      );
    }
    await client.query("INSERT INTO notifications (user_id,message,href) VALUES ($1,$2,'/applications')", [application.user_id, `Your application for ${application.title} was ${req.body.status}.`]);
    await client.query("INSERT INTO admin_activity_logs (admin_id,action,target_type,target_id,details) VALUES ($1,'updated application','application',$2,$3)", [req.session.user.id, req.params.id, req.body.status]);
    await client.query("COMMIT");
    req.session.notice = "Application updated.";
    res.redirect(`/admin/applications/${req.params.id}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.get("/documents/:id", async (req, res, next) => {
  const result = await pool.query("SELECT original_name,stored_name FROM application_documents WHERE id=$1", [req.params.id]);
  if (!result.rows[0]) return res.status(404).render("errors/404", { title: "Document not found" });
  const file = await openStoredFile(result.rows[0].stored_name);
  res.attachment(result.rows[0].original_name);
  file.on("error", next);
  file.pipe(res);
});

router.get("/company-documents/:id", async (req, res, next) => {
  const result = await pool.query("SELECT original_name,stored_name FROM company_documents WHERE id=$1", [req.params.id]);
  if (!result.rows[0]) return res.status(404).render("errors/404", { title: "Document not found" });
  const file = await openStoredFile(result.rows[0].stored_name);
  res.attachment(result.rows[0].original_name);
  file.on("error", next);
  file.pipe(res);
});

router.get("/users", adminController.users);

router.post("/users/:id/status", async (req, res) => {
  if (!["true", "false"].includes(req.body.is_active)) {
    req.session.notice = "Choose a valid user access status.";
    return res.redirect("/admin/users");
  }
  const updated = await pool.query("UPDATE users SET is_active=$1,updated_at=NOW() WHERE id=$2 AND role='user' RETURNING id", [req.body.is_active === "true", req.params.id]);
  if (!updated.rowCount) return res.status(404).render("errors/404", { title: "User not found" });
  await logActivity(req, "changed user access", "user", req.params.id, req.body.is_active);
  req.session.notice = "User access updated.";
  res.redirect("/admin/users");
});

router.get("/extensions", adminController.extensions);

router.get("/interns", adminController.interns);

router.post("/interns/:id/start", [
  body("actual_start_date").isISO8601({ strict: true }),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Enter the actual start date confirmed with the intern and host company.";
    return res.redirect("/admin/interns");
  }
  const result = await pool.query(
    "UPDATE internship_records SET actual_start_date=$1,status='active' WHERE id=$2 AND status='upcoming' RETURNING id",
    [req.body.actual_start_date, req.params.id],
  );
  if (!result.rowCount) {
    req.session.notice = "Only upcoming internship records can be marked as started.";
    return res.redirect("/admin/interns");
  }
  await logActivity(req, "confirmed internship start", "internship_record", req.params.id, req.body.actual_start_date);
  req.session.notice = "Actual internship start date recorded.";
  res.redirect("/admin/interns");
});

router.post("/interns/:id/status", async (req, res) => {
  if (!["completed", "ended"].includes(req.body.status)) {
    req.session.notice = "Choose a valid internship record status.";
    return res.redirect("/admin/interns");
  }
  const result = await pool.query(
    "UPDATE internship_records SET status=$1 WHERE id=$2 AND status='active' RETURNING id",
    [req.body.status, req.params.id],
  );
  if (!result.rowCount) {
    req.session.notice = "Only active internship records can be completed or ended.";
    return res.redirect("/admin/interns");
  }
  await logActivity(req, `marked internship ${req.body.status}`, "internship_record", req.params.id, "");
  req.session.notice = `Internship record marked ${req.body.status}.`;
  res.redirect("/admin/interns");
});

router.post("/extensions/:id/status", [
  body("status").isIn(["approved", "declined"]),
  body("admin_comment").trim().isLength({ max: 2000 }),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Choose an extension decision.";
    return res.redirect("/admin/extensions");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM extension_requests WHERE id=$1 FOR UPDATE", [req.params.id]);
    if (!found.rowCount || found.rows[0].status !== "pending") {
      await client.query("ROLLBACK");
      req.session.notice = "This extension request has already been processed.";
      return res.redirect("/admin/extensions");
    }
    const extension = found.rows[0];
      if (req.body.status === "approved" && req.body.company_confirmed !== "true") {
        await client.query("ROLLBACK");
        req.session.notice = "Confirm the host company's approval before approving an extension.";
        return res.redirect("/admin/extensions");
      }
      await client.query("UPDATE extension_requests SET status=$1,admin_comment=$2,company_confirmed=$3,updated_at=NOW() WHERE id=$4", [req.body.status, req.body.admin_comment || "", req.body.company_confirmed === "true", req.params.id]);
    if (req.body.status === "approved") {
      const record = await client.query("SELECT current_end_date FROM internship_records WHERE id=$1 FOR UPDATE", [extension.record_id]);
      await client.query("UPDATE internship_records SET current_end_date=$1 WHERE id=$2", [extension.proposed_end_date, extension.record_id]);
      await client.query(
        "INSERT INTO internship_extension_history (record_id,request_id,previous_end_date,new_end_date,approved_by) VALUES ($1,$2,$3,$4,$5)",
        [extension.record_id, req.params.id, record.rows[0].current_end_date, extension.proposed_end_date, req.session.user.id],
      );
    }
    await client.query("INSERT INTO notifications (user_id,message,href) VALUES ($1,$2,'/extensions')", [extension.user_id, `Your internship extension request was ${req.body.status}.`]);
    await client.query("COMMIT");
    req.session.notice = "Extension request updated.";
    res.redirect("/admin/extensions");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.get("/reports", adminController.reports);

router.get("/reports/summary.pdf", adminController.exportPdfReport);

router.get("/reports/applications.csv", adminController.exportApplicationsCsv);

router.get("/profile", adminController.profile);

router.post("/profile", [
  body("name").trim().isLength({ min: 2, max: 120 }),
  body("email").trim().isEmail().normalizeEmail(),
  body("phone").trim().isLength({ min: 5, max: 40 }),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Please enter a valid name, email and phone number.";
    return res.redirect("/admin/profile");
  }
  try {
    const account = await pool.query("SELECT email,password_hash FROM users WHERE id=$1 AND role='admin'", [req.session.user.id]);
    if (req.body.email !== account.rows[0].email && !(await bcrypt.compare(String(req.body.current_password || ""), account.rows[0].password_hash))) {
      req.session.notice = "Confirm your current password before changing your email.";
      return res.redirect("/admin/profile");
    }
    await pool.query("UPDATE users SET name=$1,email=$2,phone=$3,updated_at=NOW() WHERE id=$4 AND role='admin'", [req.body.name, req.body.email, req.body.phone, req.session.user.id]);
    req.session.user.name = req.body.name;
    req.session.user.email = req.body.email;
    req.session.notice = "Administrator profile updated.";
    res.redirect("/admin/profile");
  } catch (error) {
    if (error.code === "23505") {
      req.session.notice = "That email address is already associated with an account.";
      return res.redirect("/admin/profile");
    }
    throw error;
  }
});

router.get("/settings", adminController.settings);

router.post("/settings/password", [
  body("new_password").isLength({ min: 12, max: 128 }),
  body("confirm_password").custom((value, { req }) => value === req.body.new_password),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Choose an administrator password with at least 12 characters and ensure both entries match.";
    return res.redirect("/admin/settings");
  }
  const result = await pool.query("SELECT password_hash FROM users WHERE id=$1 AND role='admin'", [req.session.user.id]);
  if (!(await bcrypt.compare(String(req.body.current_password || ""), result.rows[0].password_hash))) {
    req.session.notice = "Current password is incorrect.";
    return res.redirect("/admin/settings");
  }
  await pool.query("UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2", [await bcrypt.hash(req.body.new_password, 12), req.session.user.id]);
  req.session.notice = "Administrator password changed.";
  res.redirect("/admin/settings");
});

router.get("/notifications", adminController.notifications);

router.post("/notifications/:id/read", adminController.readNotification);

async function logActivity(req, action, type, id, details) {
  await pool.query("INSERT INTO admin_activity_logs (admin_id,action,target_type,target_id,details) VALUES ($1,$2,$3,$4,$5)", [req.session.user.id, action, type, id, details || ""]);
}

module.exports = router;
