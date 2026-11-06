const dashboardModel = require("../models/dashboardModel");
const adminModel = require("../models/adminModel");
const extensionModel = require("../models/extensionModel");
const reportModel = require("../models/reportModel");
const notificationModel = require("../models/notificationModel");
const PDFDocument = require("pdfkit");
const path = require("node:path");

const tibetanFont = path.join(__dirname, "..", "node_modules", "@fontsource", "noto-serif-tibetan", "files", "noto-serif-tibetan-tibetan-400-normal.woff");

function writeReportLine(document, text, fontSize = 10) {
  const parts = String(text).split(/([\u0F00-\u0FFF]+)/u).filter(Boolean);
  parts.forEach((part, index) => {
    const font = /[\u0F00-\u0FFF]/u.test(part) ? tibetanFont : "Helvetica";
    document.font(font).fontSize(fontSize).text(part, { continued: index < parts.length - 1 });
  });
}

async function dashboard(req, res, next) {
  try {
    const data = await dashboardModel.findAdminDashboard();
    res.render("admin/dashboard", { title: "Administrator dashboard", ...data });
  } catch (error) {
    next(error);
  }
}

async function reports(_req, res, next) {
  try {
    const data = await reportModel.summary();
    res.render("admin/reports", { title: "Reports", ...data });
  } catch (error) {
    next(error);
  }
}

async function companies(_req, res, next) {
  try {
    const companies = await adminModel.listCompanies();
    res.render("admin/companies", { title: "Manage companies", companies });
  } catch (error) {
    next(error);
  }
}

function newCompany(_req, res) {
  res.render("admin/company-form", { title: "Add company", company: null });
}

async function editCompany(req, res, next) {
  try {
    const company = await adminModel.findCompanyForEdit(req.params.id);
    if (!company) return res.status(404).render("errors/404", { title: "Company not found" });
    res.render("admin/company-form", { title: "Edit company", company });
  } catch (error) {
    next(error);
  }
}

async function internships(_req, res, next) {
  try {
    const internships = await adminModel.listInternships();
    res.render("admin/internships", { title: "Manage internships", internships });
  } catch (error) {
    next(error);
  }
}

async function newInternship(_req, res, next) {
  try {
    const [companies, categories] = await Promise.all([adminModel.listActiveCompanies(), adminModel.listCategories()]);
    res.render("admin/internship-form", {
      title: "Add internship",
      companies,
      categories,
      internship: null,
    });
  } catch (error) {
    next(error);
  }
}

async function editInternship(req, res, next) {
  try {
    const [internship, categories] = await Promise.all([
      adminModel.findInternshipForEdit(req.params.id),
      adminModel.listCategories(),
    ]);
    if (!internship) return res.status(404).render("errors/404", { title: "Internship not found" });
    res.render("admin/internship-form", { title: "Edit internship", companies: [], categories, internship });
  } catch (error) {
    next(error);
  }
}

async function applications(req, res, next) {
  try {
    const status = ["pending", "approved", "declined", "cancelled"].includes(req.query.status) ? req.query.status : "";
    const applications = await adminModel.listApplications(status);
    res.render("admin/applications", { title: "Manage applications", applications, status });
  } catch (error) {
    next(error);
  }
}

async function application(req, res, next) {
  try {
    const [application, documents, history] = await Promise.all([
      adminModel.findApplication(req.params.id),
      adminModel.listApplicationDocuments(req.params.id),
      adminModel.listApplicationHistory(req.params.id),
    ]);
    if (!application) return res.status(404).render("errors/404", { title: "Application not found" });
    res.render("admin/application", { title: "Application details", application, documents, history });
  } catch (error) {
    next(error);
  }
}

async function users(_req, res, next) {
  try {
    const users = await adminModel.listUsers();
    res.render("admin/users", { title: "Manage users", users });
  } catch (error) {
    next(error);
  }
}

async function companyCommunications(req, res, next) {
  try {
    const data = await adminModel.findCompanyCommunications(req.params.id);
    if (!data.company) return res.status(404).render("errors/404", { title: "Company not found" });
    res.render("admin/communications", { title: "Company communication", ...data });
  } catch (error) {
    next(error);
  }
}

async function extensions(_req, res, next) {
  try {
    const extensions = await extensionModel.listForAdmin();
    res.render("admin/extensions", { title: "Extension requests", extensions });
  } catch (error) {
    next(error);
  }
}

async function interns(_req, res, next) {
  try {
    const records = await adminModel.listInternshipRecords();
    res.render("admin/interns", { title: "Manage interns", records });
  } catch (error) {
    next(error);
  }
}

async function profile(req, res, next) {
  try {
    const profile = await adminModel.findAdminProfile(req.session.user.id);
    res.render("admin/profile", { title: "Administrator profile", profile });
  } catch (error) {
    next(error);
  }
}

async function notifications(req, res, next) {
  try {
    await notificationModel.markAllReadForAdmin();
    const notifications = await notificationModel.listForAdmin();
    res.render("admin/notifications", { title: "Administrator notifications", notifications });
  } catch (error) {
    next(error);
  }
}

function settings(_req, res) {
  res.render("admin/settings", { title: "Administrator settings" });
}

async function readNotification(req, res, next) {
  try {
    await notificationModel.markReadForAdmin(req.params.id);
    res.redirect("/admin/notifications");
  } catch (error) {
    next(error);
  }
}

async function exportApplicationsCsv(_req, res, next) {
  try {
    const rows = await reportModel.applicationsCsv();
    const values = [["Applicant", "Email", "Internship", "Company", "Status", "Submitted", "Dzongkhag"], ...rows.map((row) => [
      row.name, row.email, row.internship, row.company, row.status, new Date(row.submitted_at).toISOString(), row.dzongkhag || "",
    ])];
    const csv = values.map((line) => line.map((value) => {
      let text = String(value ?? "");
      if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
    res.type("text/csv").attachment("internship-applications.csv").send(csv);
  } catch (error) {
    next(error);
  }
}

async function exportPdfReport(_req, res, next) {
  try {
    const { applications, categories, regions, totals } = await reportModel.summary();
    const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: "InternshipLink platform report" } });
    res.attachment(`internshiplink-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    document.pipe(res);
    document.font("Helvetica-Bold").fontSize(20).text("Bhutan InternshipLink");
    writeReportLine(document, `Platform report · Generated ${new Date().toISOString().slice(0, 10)}`, 11);
    document.moveDown();

    const section = (heading, rows, label) => {
      if (document.y > 690) document.addPage();
      document.font("Helvetica-Bold").fontSize(14).text(heading);
      document.moveDown(0.35);
      if (!rows.length) writeReportLine(document, "No data available.");
      else rows.forEach((row) => writeReportLine(document, `${row[label]}: ${row.count}`));
      document.moveDown();
    };

    section("Platform totals", [
      { label: "Active users", count: totals.users },
      { label: "Active verified companies", count: totals.companies },
      { label: "Published internships", count: totals.internships },
      { label: "Applications", count: totals.applications },
    ], "label");
    section("Applications by status", applications, "status");
    section("Internships by category", categories, "category");
    section("Applications by Dzongkhag", regions, "dzongkhag");
    document.end();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  application,
  applications,
  companies,
  companyCommunications,
  dashboard,
  editCompany,
  editInternship,
  extensions,
  exportApplicationsCsv,
  exportPdfReport,
  interns,
  internships,
  newCompany,
  newInternship,
  profile,
  notifications,
  readNotification,
  reports,
  settings,
  users,
};
