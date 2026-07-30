const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/class.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin } = require("../middleware/roles");
const { body } = require("express-validator");
const validate = require("../middleware/validate");

router.use(authenticate, tenantScope);

// ─── Debug Routes (Remove in production) ───
router.get("/debug/user", (req, res) => {
  res.json({
    success: true,
    user: req.user,
    schoolId: req.user?.schoolId,
    headers: req.headers.authorization ? 'Bearer token present' : 'No token'
  });
});

router.get("/debug/check", async (req, res) => {
  try {
    const { prisma } = require("../config/db");
    const count = await prisma.class.count();
    const sample = await prisma.class.findFirst();
    res.json({
      success: true,
      count,
      sample,
      schoolId: req.user?.schoolId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ─── Main Routes ───
router.get("/",    isSchoolStaff, controller.list);
router.get("/:id", isSchoolStaff, controller.getOne);

router.post("/",
  isSchoolAdmin,
  [
    body("level").isIn(["JHS1","JHS2","JHS3"]).withMessage("Level must be JHS1, JHS2, or JHS3."),
    body("section").trim().notEmpty().withMessage("Section is required."),
    body("academicYear").matches(/^\d{4}\/\d{4}$/).withMessage("Academic year must be YYYY/YYYY."),
  ],
  validate,
  controller.create
);

router.patch("/:id",  isSchoolAdmin, controller.update);
router.delete("/:id", isSchoolAdmin, controller.remove);

router.post("/:id/subjects",
  isSchoolAdmin,
  [body("subjectId").notEmpty().withMessage("Subject ID is required.")],
  validate,
  controller.assignSubject
);

router.delete("/:id/subjects/:subjectId", isSchoolAdmin, controller.removeSubject);

module.exports = router;