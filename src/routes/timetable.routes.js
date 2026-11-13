const express = require("express");
const { body, param, query } = require("express-validator");
const controller = require("../controllers/portalAcademic.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { authorize } = require("../middleware/roles");
const validate = require("../middleware/validate");

const router = express.Router();
const staffRoles = ["SCHOOL_ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"];

router.use(authenticate, tenantScope);

router.get(
  "/classes/:classId",
  authorize(...staffRoles),
  [param("classId").isUUID(), query("termId").optional().isUUID()],
  validate,
  controller.getClassTimetable
);

router.get(
  "/teachers/me",
  authorize("CLASS_TEACHER", "SUBJECT_TEACHER"),
  [query("termId").optional().isUUID()],
  validate,
  controller.getTeacherTimetable
);

router.post(
  "/slots",
  authorize("SCHOOL_ADMIN"),
  [
    body("id").optional().isUUID(),
    body("classId").isUUID(),
    body("termId").isUUID(),
    body("subjectId").optional({ values: "falsy" }).isUUID(),
    body("teacherId").optional({ values: "falsy" }).isUUID(),
    body("weekday").isIn(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]),
    body("startTime").matches(/^([01]\d|2[0-3]):[0-5]\d$/),
    body("endTime").matches(/^([01]\d|2[0-3]):[0-5]\d$/),
    body("room").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
  ],
  validate,
  controller.saveTimetableSlot
);

module.exports = router;
