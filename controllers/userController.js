const dashboardModel = require("../models/dashboardModel");
const userModel = require("../models/userModel");
const applicationModel = require("../models/applicationModel");
const extensionModel = require("../models/extensionModel");
const notificationModel = require("../models/notificationModel");
const { openStoredFile } = require("../services/file-storage");

async function dashboard(req, res, next) {
  try {
    const data = await dashboardModel.findSeekerDashboard(req.session.user.id);
    res.render("user/dashboard", { title: "My dashboard", ...data });
  } catch (error) {
    next(error);
  }
}

async function applyForm(req, res, next) {
  try {
    const internship = await applicationModel.findOpenInternship(req.params.id);
    if (!internship) return res.status(404).render("errors/404", { title: "Internship unavailable" });
    const existing = await applicationModel.hasUserApplied(req.session.user.id, req.params.id);
    if (existing) {
      req.session.notice = "You have already applied for this internship.";
      return res.redirect(`/internships/${req.params.id}`);
    }
    const profile = await userModel.findApplicationProfile(req.session.user.id);
    res.render("user/apply", { title: "Apply for internship", internship, profile });
  } catch (error) {
    next(error);
  }
}

async function applications(req, res, next) {
  try {
    const applications = await userModel.listApplications(req.session.user.id);
    res.render("user/applications", { title: "My applications", applications });
  } catch (error) {
    next(error);
  }
}

async function editApplication(req, res, next) {
  try {
    const application = await applicationModel.findEditableForUser(req.params.id, req.session.user.id);
    if (!application) {
      req.session.notice = "Only pending applications can be edited.";
      return res.redirect("/applications");
    }
    const [documents, profile] = await Promise.all([
      applicationModel.listDocumentsForUserApplication(req.params.id, req.session.user.id),
      userModel.findApplicationProfile(req.session.user.id),
    ]);
    res.render("user/apply", {
      title: "Edit application",
      application,
      documents,
      editing: true,
      internship: { id: application.internship_id, title: application.title, company_name: application.company_name },
      profile,
    });
  } catch (error) {
    next(error);
  }
}

async function internships(req, res, next) {
  try {
    const records = await userModel.listInternships(req.session.user.id);
    res.render("user/internships", { title: "My internships", records });
  } catch (error) {
    next(error);
  }
}

async function documents(req, res, next) {
  try {
    const documents = await userModel.listDocuments(req.session.user.id);
    res.render("user/documents", { title: "My documents", documents });
  } catch (error) {
    next(error);
  }
}

async function profile(req, res, next) {
  try {
    const profile = await userModel.findProfile(req.session.user.id);
    res.render("user/profile", { title: "My profile", profile });
  } catch (error) {
    next(error);
  }
}

async function extensions(req, res, next) {
  try {
    const records = await extensionModel.listForUser(req.session.user.id);
    res.render("user/extensions", { title: "Internship extensions", records });
  } catch (error) {
    next(error);
  }
}

async function notifications(req, res, next) {
  try {
    await notificationModel.markAllReadForUser(req.session.user.id);
    const notifications = await notificationModel.listForUser(req.session.user.id);
    res.render("user/notifications", { title: "Notifications", notifications });
  } catch (error) {
    next(error);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    await notificationModel.markReadForUser(req.params.id, req.session.user.id);
    res.redirect("/notifications");
  } catch (error) {
    next(error);
  }
}

async function downloadDocument(req, res, next) {
  try {
    const document = await applicationModel.findDocumentForUser(req.params.id, req.session.user.id);
    if (!document) return res.status(404).render("errors/404", { title: "Document not found" });
    const file = await openStoredFile(document.stored_name);
    res.attachment(document.original_name);
    file.on("error", next);
    file.pipe(res);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  applications,
  applyForm,
  dashboard,
  documents,
  downloadDocument,
  editApplication,
  extensions,
  internships,
  markNotificationRead,
  notifications,
  profile,
};
