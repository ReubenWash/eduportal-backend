const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/class.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin } = require("../middleware/roles");
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const { createClassValidator, updateClassValidator } = require("../validators/class.validator");

// All routes require authentication
router.use(authenticate, tenantScope);

// ─── Public routes (for authenticated users) ───
router.get("/",    isSchoolStaff, controller.list);
router.get("/:id", isSchoolStaff, controller.getOne);

// ─── Admin only routes ───
router.post("/",
  isSchoolAdmin,
  createClassValidator,
  validate,
  controller.create
);

router.patch("/:id", isSchoolAdmin, updateClassValidator, validate, controller.update);
router.delete("/:id", isSchoolAdmin, controller.remove);

// ─── Subject assignment (Admin only) ───
router.post("/:id/subjects",
  isSchoolAdmin,
  [body("subjectId").notEmpty().withMessage("Subject ID is required.")],
  validate,
  controller.assignSubject
);

router.delete("/:id/subjects/:subjectId", isSchoolAdmin, controller.removeSubject);

module.exports = router;