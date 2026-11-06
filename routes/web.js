const express = require("express");
const { validateId } = require("../middleware/ids");
const pageController = require("../controllers/pageController");
const internshipController = require("../controllers/internshipController");
const companyController = require("../controllers/companyController");

const router = express.Router();
router.param("id", validateId);

router.get("/", pageController.home);
router.get("/internships", internshipController.list);
router.get("/short-term-internships", (_req, res) => res.redirect(302, "/internships?type=short-term"));
router.get("/vacation-internships", (_req, res) => res.redirect(302, "/internships?type=vacation"));
router.get("/internships/:id", internshipController.show);
router.get("/companies", companyController.list);
router.get("/companies/:id/logo", companyController.logo);
router.get("/companies/:id", companyController.show);
router.get("/about", pageController.about);

module.exports = router;
