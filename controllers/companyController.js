const companyModel = require("../models/companyModel");
const { openStoredFile } = require("../services/file-storage");

async function list(_req, res, next) {
  try {
    const companies = await companyModel.listPublished();
    res.render("companies/index", { title: "Explore companies", companies });
  } catch (error) {
    next(error);
  }
}

async function logo(req, res, next) {
  try {
    const company = await companyModel.findPublishedLogo(req.params.id);
    if (!company) return res.status(404).end();
    const file = await openStoredFile(company.logo_stored_name);
    res.type(company.logo_mime_type);
    res.set("Cache-Control", "public, max-age=86400");
    file.on("error", next);
    file.pipe(res);
  } catch (error) {
    next(error);
  }
}

async function show(req, res, next) {
  try {
    const company = await companyModel.findPublishedById(req.params.id);
    if (!company) return res.status(404).render("errors/404", { title: "Company not found" });
    const internships = await companyModel.listPublishedInternships(req.params.id);
    res.render("companies/show", { title: company.name, company, internships });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, logo, show };
