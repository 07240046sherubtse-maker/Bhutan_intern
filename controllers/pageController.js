const internshipModel = require("../models/internshipModel");

async function home(_req, res, next) {
  try {
    const internships = await internshipModel.listFeatured();
    res.render("home", { title: "Bhutan InternshipLink", internships });
  } catch (error) {
    next(error);
  }
}

function about(_req, res) {
  res.render("pages/about", { title: "About Bhutan InternshipLink" });
}

module.exports = { about, home };
