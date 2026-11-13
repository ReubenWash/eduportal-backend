const express = require("express");
const { body, param, query } = require("express-validator");
const controller = require("../controllers/portalAcademic.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { authorize } = require("../middleware/roles");
const validate = require("../middleware/validate");

const router = express.Router();
const staffRoles = ["SCHOOL_ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"];
const incidentTypes = ["ACHIEVEMENT", "CONDUCT", "DISCIPLINARY"];

router.use(authenticate, tenantScope, authorize(...staffRoles));

router.get(
  "/incidents",
  [
    query("studentId").optional().isUUID(),
    query("classId").optional().isUUID(),
    query("termId").optional().isUUID(),
    query("type").optional().isIn(incidentTypes),
  ],
  validate,
  controller.listConductIncidents
);

router.post(
  "/incidents",
  [
    body("studentId").isUUID(),
    body("classId").optional({ values: "falsy" }).isUUID(),
    body("termId").optional({ values: "falsy" }).isUUID(),
    body("type").isIn(incidentTypes),
    body("title").trim().notEmpty().isLength({ max: 200 }),
    body("note").optional({ values: "falsy" }).isString().isLength({ max: 5000 }),
    body("occurredAt").optional().isISO8601().toDate(),
  ],
  validate,
  controller.createConductIncident
);

router.patch(
  "/incidents/:id",
  [
    param("id").isUUID(),
    body("actionTaken").optional().isString().isLength({ max: 5000 }),
    body("resolved").optional().isBoolean().toBoolean(),
  ],
  validate,
  controller.updateConductIncident
);

module.exports = router;
