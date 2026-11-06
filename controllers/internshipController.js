const internshipModel = require("../models/internshipModel");

async function list(req, res, next) {
  try {
    const results = await internshipModel.listPublished(req.query);
    res.render("internships/index", { title: "Find internships", ...results, filters: req.query });
  } catch (error) {
    next(error);
  }
}

async function show(req, res, next) {
  try {
    const internship = await internshipModel.findPublishedById(req.params.id);
    if (!internship) return res.status(404).render("errors/404", { title: "Internship not found" });
    let applied = false;
    if (req.session.user?.role === "user") {
      applied = await internshipModel.hasUserApplied(req.session.user.id, req.params.id);
    }
    res.render("internships/show", { title: internship.title, internship, applied });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, show };
