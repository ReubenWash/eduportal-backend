const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/analytics.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolAdmin } = require("../middleware/roles");

router.use(authenticate, tenantScope, isSchoolAdmin);

router.get("/performance",  controller.performance);
router.get("/subjects",     controller.subjects);
router.get("/top-students", controller.topStudents);
router.get("/trends",       controller.trends);
router.get("/gender",       controller.gender);
router.get("/export",       controller.exportData);

module.exports = router;
