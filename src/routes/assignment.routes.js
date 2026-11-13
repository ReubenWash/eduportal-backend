const express = require("express");
const { body, param, query } = require("express-validator");
const controller = require("../controllers/portalAcademic.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { authorize, isSchoolAdmin } = require("../middleware/roles");
const validate = require("../middleware/validate");

const router = express.Router();
const staffRoles = ["SCHOOL_ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"];
const portalRoles = [...staffRoles, "STUDENT", "PARENT"];

router.use(authenticate, tenantScope);

router.get(
  "/",
  authorize(...portalRoles),
  [
    query("classId").optional().isUUID(),
    query("subjectId").optional().isUUID(),
    query("studentId").optional().isUUID(),
    query("status").optional().isIn(["ACTIVE", "COMPLETED"]),
  ],
  validate,
  controller.listAssignments
);

router.post(
  "/",
  authorize(...staffRoles),
  [
    body("classId").isUUID(),
    body("termId").isUUID(),
    body("subjectId").optional({ values: "falsy" }).isUUID(),
    body("teacherId").optional({ values: "falsy" }).isUUID(),
    body("title").trim().notEmpty().isLength({ max: 200 }),
    body("details").optional({ values: "falsy" }).isString().isLength({ max: 10000 }),
    body("attachmentUrl").optional({ values: "falsy" }).isURL({ require_tld: false }),
    body("dueDate").isISO8601().toDate(),
  ],
  validate,
  controller.createAssignment
);

router.get(
  "/:id/submissions",
  authorize(...staffRoles),
  [param("id").isUUID()],
  validate,
  controller.getAssignmentSubmissions
);

router.post(
  "/:id/submissions",
  authorize("STUDENT"),
  [
    param("id").isUUID(),
    body("answerUrl").optional({ values: "falsy" }).isURL({ require_tld: false }),
  ],
  validate,
  controller.submitAssignment
);

router.patch(
  "/submissions/:submissionId",
  authorize(...staffRoles),
  [
    param("submissionId").isUUID(),
    body("score").isFloat({ min: 0, max: 100 }).toFloat(),
    body("feedback").optional({ values: "falsy" }).isString().isLength({ max: 5000 }),
  ],
  validate,
  controller.gradeSubmission
);

module.exports = router;
