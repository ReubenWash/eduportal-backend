const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/score.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin } = require("../middleware/roles");
const { uploadExcel } = require("../middleware/uploadExcel");
const validate     = require("../middleware/validate");
const { submitScoreValidator, computeValidator } = require("../validators/score.validator");

router.use(authenticate, tenantScope);

router.get("/",                 isSchoolStaff, controller.list);
router.get("/class-summary",    isSchoolStaff, controller.summary);
router.get("/submission-status",isSchoolStaff, controller.subStatus);

router.get("/template",      isSchoolStaff, controller.downloadTemplate);
router.post("/import-excel", isSchoolStaff, uploadExcel, controller.importExcel);

router.post("/",         isSchoolStaff, submitScoreValidator, validate, controller.submit);
router.patch("/:id",     isSchoolStaff, controller.update);
router.post("/compute",  isSchoolAdmin, computeValidator, validate, controller.compute);

module.exports = router;