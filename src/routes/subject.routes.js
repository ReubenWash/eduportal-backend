const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/subject.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin } = require("../middleware/roles");
const { body } = require("express-validator");
const validate = require("../middleware/validate");

router.use(authenticate, tenantScope);

// ─── GET /subjects - List all subjects ───
router.get("/", isSchoolStaff, controller.list);

// ─── GET /subjects/:id - Get single subject ───
router.get("/:id", isSchoolStaff, controller.getOne);

// ─── POST /subjects - Create subject (Admin only) ───
router.post(
  "/",
  isSchoolAdmin,
  [
    body("name").trim().notEmpty().withMessage("Subject name is required."),
    body("code").trim().notEmpty().withMessage("Subject code is required."),
    body("type").isIn(["CORE", "ELECTIVE"]).withMessage("Type must be CORE or ELECTIVE."),
  ],
  validate,
  controller.create
);

// ─── PATCH /subjects/:id - Update subject (Admin only) ───
router.patch("/:id", isSchoolAdmin, controller.update);

// ─── DELETE /subjects/:id - Delete subject (Admin only) ───
router.delete("/:id", isSchoolAdmin, controller.remove);

module.exports = router;