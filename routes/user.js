const express = require("express");
const path = require("node:path");
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/database");
const { requireUser } = require("../middleware/auth");
const { upload, hasAllowedSignature } = require("../middleware/upload");
const { csrfSynchronisedProtection } = require("../middleware/csrf");
const { validateId } = require("../middleware/ids");
const { normalizeDateFields } = require("../middleware/date-format");
const { publicBaseUrl, sendEmail, verificationRequired } = require("../services/email");
const { issueVerificationToken } = require("../services/tokens");
const { discardUpload, openStoredFile, persistUpload } = require("../services/file-storage");
const userController = require("../controllers/userController");

const router = express.Router();
router.param("id", validateId);

const applicationValidators = [
  body("date_of_birth").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("preferred_start_date").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("requested_duration").trim().isLength({ min: 1, max: 100 }),
  body("address").optional({ values: "falsy" }).isLength({ max: 1000 }),
  body("dzongkhag").optional({ values: "falsy" }).isLength({ max: 100 }),
  body("education").optional({ values: "falsy" }).isLength({ max: 200 }),
  body("institution").optional({ values: "falsy" }).isLength({ max: 200 }),
  body("field_of_study").optional({ values: "falsy" }).isLength({ max: 200 }),
  body("experience").optional({ values: "falsy" }).isLength({ max: 4000 }),
  body("skills").optional({ values: "falsy" }).isLength({ max: 2000 }),
  body("cover_letter").optional({ values: "falsy" }).isLength({ max: 8000 }),
  body("reason").optional({ values: "falsy" }).isLength({ max: 3000 }),
];

router.get("/dashboard", requireUser, userController.dashboard);

router.get("/internships/:id/apply", requireUser, userController.applyForm);

router.post("/internships/:id/apply", requireUser, upload.array("documents", 8), normalizeDateFields, csrfSynchronisedProtection, applicationValidators, async (req, res) => {
  const files = req.files || [];
  if (!validationResult(req).isEmpty()) {
    await Promise.all(files.map((file) => discardUpload(file).catch((error) => console.error("Could not remove rejected application upload:", error))));
    req.session.notice = "Please correct the application details and try again.";
    return res.redirect(`/internships/${req.params.id}/apply`);
  }
  for (const file of files) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!(await hasAllowedSignature(file.path, extension))) {
      await Promise.all(files.map((item) => discardUpload(item).catch((error) => console.error("Could not remove rejected application upload:", error))));
      return res.status(400).render("errors/error", { title: "Invalid document", message: "One or more uploads did not match the permitted document type." });
    }
  }
  for (const file of files) file.storedName = await persistUpload(file);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const internship = await client.query(
      `SELECT i.id FROM internships i JOIN companies c ON c.id=i.company_id
       WHERE i.id=$1 AND i.status='published' AND c.verification_status='verified'
       AND c.partnership_status='active' AND (i.deadline IS NULL OR i.deadline >= CURRENT_DATE) FOR UPDATE`,
      [req.params.id],
    );
    if (!internship.rowCount) {
      await client.query("ROLLBACK");
      await Promise.all(files.map((file) => discardUpload(file).catch((error) => console.error("Could not remove unavailable-application upload:", error))));
      req.session.notice = "This internship is no longer accepting applications.";
      return res.redirect("/internships");
    }
    const result = await client.query(
      `INSERT INTO internship_applications
       (user_id, internship_id, date_of_birth, address, dzongkhag, education, institution, field_of_study, experience, skills, preferred_start_date, requested_duration, cover_letter, reason)
       VALUES ($1,$2,NULLIF($3,'')::date,$4,$5,$6,$7,$8,$9,$10,NULLIF($11,'')::date,$12,$13,$14) RETURNING id`,
      [req.session.user.id, req.params.id, req.body.date_of_birth || "", req.body.address || "", req.body.dzongkhag || "", req.body.education || "", req.body.institution || "", req.body.field_of_study || "", req.body.experience || "", req.body.skills || "", req.body.preferred_start_date || "", req.body.requested_duration || "", req.body.cover_letter || "", req.body.reason || ""],
    );
    const applicationId = result.rows[0].id;
    for (const file of files) {
      await client.query(
        "INSERT INTO application_documents (application_id,user_id,original_name,stored_name,mime_type,size_bytes) VALUES ($1,$2,$3,$4,$5,$6)",
        [applicationId, req.session.user.id, path.basename(file.originalname).slice(0, 200), file.storedName, file.mimetype, file.size],
      );
    }
    await client.query("INSERT INTO application_status_history (application_id,changed_by,new_status) VALUES ($1,$2,'pending')", [applicationId, req.session.user.id]);
    await client.query("INSERT INTO notifications (role_target,message,href) VALUES ('admin',$1,'/admin/applications')", [`New application submitted by ${req.session.user.name}`]);
    await client.query("INSERT INTO notifications (user_id,message,href) VALUES ($1,'Your application was submitted.','/applications')", [req.session.user.id]);
    await client.query("COMMIT");
    req.session.notice = "Your application has been submitted.";
    res.redirect("/applications");
  } catch (error) {
    await client.query("ROLLBACK");
    await Promise.all(files.map((file) => discardUpload(file).catch((cleanupError) => console.error("Could not remove failed application upload:", cleanupError))));
    if (error.code === "23505") {
      req.session.notice = "You have already applied for this internship.";
      return res.redirect("/internships/" + req.params.id);
    }
    throw error;
  } finally {
    client.release();
  }
});

router.get("/applications", requireUser, userController.applications);

router.get("/applications/:id/edit", requireUser, userController.editApplication);

router.post("/applications/:id/edit", requireUser, upload.array("documents", 8), normalizeDateFields, csrfSynchronisedProtection, applicationValidators, async (req, res) => {
  const files = req.files || [];
  if (!validationResult(req).isEmpty()) {
    await Promise.all(files.map((file) => discardUpload(file).catch((error) => console.error("Could not remove rejected application upload:", error))));
    req.session.notice = "Please correct the application details and try again.";
    return res.redirect(`/applications/${req.params.id}/edit`);
  }
  for (const file of files) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!(await hasAllowedSignature(file.path, extension))) {
      await Promise.all(files.map((item) => discardUpload(item).catch((error) => console.error("Could not remove rejected application upload:", error))));
      return res.status(400).render("errors/error", { title: "Invalid document", message: "One or more uploads did not match the permitted document type." });
    }
  }

  let client;
  try {
    for (const file of files) file.storedName = await persistUpload(file);
    client = await pool.connect();
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT id,status FROM internship_applications WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, req.session.user.id],
    );
    if (!current.rowCount || current.rows[0].status !== "pending") {
      await client.query("ROLLBACK");
      await Promise.all(files.map((file) => discardUpload(file).catch((error) => console.error("Could not remove rejected application upload:", error))));
      req.session.notice = "Only pending applications can be edited.";
      return res.redirect("/applications");
    }
    const documents = await client.query(
      "SELECT COUNT(*)::int AS count FROM application_documents WHERE application_id=$1",
      [req.params.id],
    );
    if (documents.rows[0].count + files.length > 8) {
      await client.query("ROLLBACK");
      await Promise.all(files.map((file) => discardUpload(file).catch((error) => console.error("Could not remove excess application upload:", error))));
      req.session.notice = "Applications can have up to 8 supporting documents in total.";
      return res.redirect(`/applications/${req.params.id}/edit`);
    }
    await client.query(
      `UPDATE internship_applications SET
       date_of_birth=NULLIF($1,'')::date,address=$2,dzongkhag=$3,education=$4,institution=$5,
       field_of_study=$6,experience=$7,skills=$8,preferred_start_date=NULLIF($9,'')::date,
       requested_duration=$10,cover_letter=$11,reason=$12,updated_at=NOW()
       WHERE id=$13`,
      [
        req.body.date_of_birth || "", req.body.address || "", req.body.dzongkhag || "",
        req.body.education || "", req.body.institution || "", req.body.field_of_study || "",
        req.body.experience || "", req.body.skills || "", req.body.preferred_start_date || "",
        req.body.requested_duration, req.body.cover_letter || "", req.body.reason || "",
        req.params.id,
      ],
    );
    for (const file of files) {
      await client.query(
        "INSERT INTO application_documents (application_id,user_id,original_name,stored_name,mime_type,size_bytes) VALUES ($1,$2,$3,$4,$5,$6)",
        [req.params.id, req.session.user.id, path.basename(file.originalname).slice(0, 200), file.storedName, file.mimetype, file.size],
      );
    }
    await client.query(
      "INSERT INTO notifications (role_target,message,href) VALUES ('admin',$1,'/admin/applications')",
      [`${req.session.user.name} updated a pending application.`],
    );
    await client.query("COMMIT");
    req.session.notice = "Your application changes have been saved.";
    res.redirect("/applications");
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    await Promise.all(files.map((file) => discardUpload(file).catch((cleanupError) => console.error("Could not remove failed application upload:", cleanupError))));
    throw error;
  } finally {
    if (client) client.release();
  }
});

router.get("/my-internships", requireUser, userController.internships);

router.get("/documents", requireUser, userController.documents);

router.post("/applications/:id/cancel", requireUser, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT status FROM internship_applications WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.id, req.session.user.id]);
    if (!current.rowCount || current.rows[0].status !== "pending") {
      await client.query("ROLLBACK");
      req.session.notice = "Only pending applications can be cancelled.";
      return res.redirect("/applications");
    }
    await client.query("UPDATE internship_applications SET status='cancelled',updated_at=NOW() WHERE id=$1", [req.params.id]);
    await client.query("INSERT INTO application_status_history (application_id,changed_by,old_status,new_status) VALUES ($1,$2,'pending','cancelled')", [req.params.id, req.session.user.id]);
    await client.query("INSERT INTO notifications (role_target,message,href) VALUES ('admin','An applicant cancelled an application.','/admin/applications')");
    await client.query("COMMIT");
    req.session.notice = "Application cancelled.";
    res.redirect("/applications");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.get("/profile", requireUser, userController.profile);

router.post("/profile", requireUser, [
  body("name").trim().isLength({ min: 2, max: 120 }),
  body("phone").trim().isLength({ min: 5, max: 40 }),
  body("email").trim().isEmail().normalizeEmail(),
  body("date_of_birth").optional({ values: "falsy" }).isISO8601({ strict: true }),
  body("gender").optional({ values: "falsy" }).isIn(["Female", "Male", "Other"]),
  body("dzongkhag").optional({ values: "falsy" }).isLength({ max: 100 }),
  body("gewog").optional({ values: "falsy" }).isLength({ max: 100 }),
  body("address").optional({ values: "falsy" }).isLength({ max: 1000 }),
  body("education").optional({ values: "falsy" }).isLength({ max: 200 }),
  body("institution").optional({ values: "falsy" }).isLength({ max: 200 }),
  body("field_of_study").optional({ values: "falsy" }).isLength({ max: 200 }),
  body("preference").optional({ values: "falsy" }).isIn(["short-term", "long-term", "vacation", "part-time", "full-time", "any"]),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Please check your profile details.";
    return res.redirect("/profile");
  }
  const client = await pool.connect();
  let clientReleased = false;
  try {
    await client.query("BEGIN");
    const account = await client.query("SELECT email,password_hash FROM users WHERE id=$1 FOR UPDATE", [req.session.user.id]);
    const changedEmail = req.body.email !== account.rows[0].email;
    if (changedEmail) {
      if (!(await bcrypt.compare(String(req.body.current_password || ""), account.rows[0].password_hash))) {
        await client.query("ROLLBACK");
        req.session.notice = "Confirm your current password before changing your email.";
        return res.redirect("/profile");
      }
    }
    await client.query(
      `UPDATE users SET name=$1,phone=$2,email=$3,
       email_verified_at=CASE WHEN $4 THEN CASE WHEN $5 THEN NULL ELSE NOW() END ELSE email_verified_at END,
       updated_at=NOW() WHERE id=$6`,
      [req.body.name, req.body.phone, req.body.email, changedEmail, verificationRequired(), req.session.user.id],
    );
    await client.query(
      `INSERT INTO user_profiles (user_id,date_of_birth,gender,dzongkhag,gewog,address,education,institution,field_of_study,preference)
       VALUES ($1,NULLIF($2,'')::date,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id) DO UPDATE SET date_of_birth=EXCLUDED.date_of_birth,gender=EXCLUDED.gender,dzongkhag=EXCLUDED.dzongkhag,
       gewog=EXCLUDED.gewog,address=EXCLUDED.address,education=EXCLUDED.education,institution=EXCLUDED.institution,
       field_of_study=EXCLUDED.field_of_study,preference=EXCLUDED.preference,updated_at=NOW()`,
      [req.session.user.id, req.body.date_of_birth || "", req.body.gender || "", req.body.dzongkhag || "", req.body.gewog || "", req.body.address || "", req.body.education || "", req.body.institution || "", req.body.field_of_study || "", req.body.preference || ""],
    );
    const verificationToken = changedEmail && verificationRequired()
      ? await issueVerificationToken(client, req.session.user.id, req.body.email)
      : null;
    if (changedEmail && !verificationToken) {
      await client.query("DELETE FROM email_verification_tokens WHERE user_id=$1", [req.session.user.id]);
    }
    await client.query("COMMIT");
    client.release();
    clientReleased = true;
    req.session.user.name = req.body.name;
    if (!verificationToken) req.session.user.email = req.body.email;
    if (verificationToken) {
      try {
        const link = `${publicBaseUrl()}/verify-email?token=${encodeURIComponent(verificationToken)}`;
        await sendEmail({
          to: req.body.email,
          subject: "Verify your new Bhutan InternshipLink email",
          text: `Verify your new email address within 24 hours by opening this link:\n\n${link}`,
        });
        req.session.notice = "Profile updated. Verify your new email address before using it to sign in.";
      } catch (error) {
        console.error("Email-change verification could not be sent:", error);
        req.session.notice = "Profile updated, but the verification email could not be delivered. Request another link from sign in.";
      }
    } else {
      req.session.notice = "Profile updated.";
    }
    res.redirect("/profile");
  } catch (error) {
    if (!clientReleased) await client.query("ROLLBACK");
    if (error.code === "23505") {
      req.session.notice = "That email address is already associated with an account.";
      return res.redirect("/profile");
    }
    throw error;
  } finally {
    if (!clientReleased) client.release();
  }
});

router.get("/settings", requireUser, (_req, res) => res.render("user/settings", { title: "Account settings" }));

router.post("/settings/password", requireUser, [
  body("new_password").isLength({ min: 10, max: 128 }),
  body("confirm_password").custom((value, { req }) => value === req.body.new_password),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Choose a password with at least 10 characters and make sure both entries match.";
    return res.redirect("/settings");
  }
  const result = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.session.user.id]);
  if (!(await bcrypt.compare(String(req.body.current_password || ""), result.rows[0].password_hash))) {
    req.session.notice = "Current password is incorrect.";
    return res.redirect("/settings");
  }
  const hash = await bcrypt.hash(req.body.new_password, 12);
  await pool.query("UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2", [hash, req.session.user.id]);
  req.session.notice = "Password changed successfully.";
  res.redirect("/settings");
});

router.get("/extensions", requireUser, userController.extensions);

router.post("/records/:id/extensions", requireUser, [
  body("additional_duration").trim().isLength({ min: 1, max: 100 }),
  body("proposed_end_date").isISO8601({ strict: true }),
  body("reason").trim().isLength({ min: 5, max: 3000 }),
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    req.session.notice = "Please provide the extension duration, proposed end date and a short reason.";
    return res.redirect("/extensions");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const record = await client.query("SELECT id FROM internship_records WHERE id=$1 AND user_id=$2 AND status='active' FOR UPDATE", [req.params.id, req.session.user.id]);
    if (!record.rowCount) {
      await client.query("ROLLBACK");
      req.session.notice = "Only active internship records can request an extension.";
      return res.redirect("/extensions");
    }
    const currentEnd = await client.query("SELECT current_end_date FROM internship_records WHERE id=$1", [req.params.id]);
    if (currentEnd.rows[0].current_end_date && new Date(req.body.proposed_end_date) <= new Date(currentEnd.rows[0].current_end_date)) {
      await client.query("ROLLBACK");
      req.session.notice = "The proposed end date must be later than the current end date.";
      return res.redirect("/extensions");
    }
    const pending = await client.query("SELECT id FROM extension_requests WHERE record_id=$1 AND status='pending'", [req.params.id]);
    if (pending.rowCount) {
      await client.query("ROLLBACK");
      req.session.notice = "You already have a pending request for this internship.";
      return res.redirect("/extensions");
    }
    await client.query(
      "INSERT INTO extension_requests (record_id,user_id,additional_duration,proposed_end_date,reason) VALUES ($1,$2,$3,$4,$5)",
      [req.params.id, req.session.user.id, req.body.additional_duration, req.body.proposed_end_date, req.body.reason],
    );
    await client.query("INSERT INTO notifications (role_target,message,href) VALUES ('admin',$1,'/admin/extensions')", [`${req.session.user.name} requested an internship extension.`]);
    await client.query("COMMIT");
    req.session.notice = "Extension request submitted for administrator review and company confirmation.";
    res.redirect("/extensions");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.get("/notifications", requireUser, userController.notifications);

router.post("/notifications/:id/read", requireUser, userController.markNotificationRead);

router.get("/documents/:id", requireUser, userController.downloadDocument);

module.exports = router;
