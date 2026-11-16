const express = require("express");
const { body, param, query } = require("express-validator");
const controller = require("../controllers/school-operations.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { authorize } = require("../middleware/roles");
const validate = require("../middleware/validate");

const router = express.Router();
const schoolAdmin = authorize("SCHOOL_ADMIN");
const financeStaff = authorize("SCHOOL_ADMIN", "ACCOUNTANT");

router.use(authenticate, tenantScope);

router.get("/export", schoolAdmin, controller.exportSchoolData);
router.get("/announcements", schoolAdmin, controller.listAnnouncements);

router.get("/books", schoolAdmin, [query("search").optional().isString().isLength({ max: 120 })], validate, controller.listBooks);
router.post(
  "/books",
  schoolAdmin,
  [
    body("title").trim().notEmpty().isLength({ max: 200 }),
    body("author").optional({ values: "falsy" }).isString().isLength({ max: 160 }),
    body("category").optional({ values: "falsy" }).isString().isLength({ max: 120 }),
    body("isbn").optional({ values: "falsy" }).isString().isLength({ max: 40 }),
    body("totalCopies").isInt({ min: 1, max: 100000 }),
  ],
  validate,
  controller.createBook
);
router.patch(
  "/books/:id",
  schoolAdmin,
  [
    param("id").isUUID(),
    body("title").optional().trim().notEmpty().isLength({ max: 200 }),
    body("author").optional({ values: "null" }).isString().isLength({ max: 160 }),
    body("category").optional({ values: "null" }).isString().isLength({ max: 120 }),
    body("isbn").optional({ values: "null" }).isString().isLength({ max: 40 }),
    body("totalCopies").optional().isInt({ min: 1, max: 100000 }),
  ],
  validate,
  controller.updateBook
);
router.delete("/books/:id", schoolAdmin, [param("id").isUUID()], validate, controller.deleteBook);

router.get(
  "/transport-routes",
  schoolAdmin,
  [query("search").optional().isString().isLength({ max: 120 })],
  validate,
  (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
  controller.listTransportRoutes
);
router.post(
  "/transport-routes",
  schoolAdmin,
  [
    body("name").trim().notEmpty().isLength({ max: 160 }),
    body("vehiclePlate").optional({ values: "falsy" }).isString().isLength({ max: 30 }),
    body("driverName").optional({ values: "falsy" }).isString().isLength({ max: 160 }),
    body("driverPhone").optional({ values: "falsy" }).isString().isLength({ max: 40 }),
    body("stopCount").optional().isInt({ min: 0, max: 1000 }),
    body("capacity").optional().isInt({ min: 0, max: 10000 }),
    body("status").optional().isIn(["ACTIVE", "MAINTENANCE", "INACTIVE"]),
  ],
  validate,
  controller.createTransportRoute
);
router.patch(
  "/transport-routes/:id",
  schoolAdmin,
  [
    param("id").isUUID(),
    body("name").optional().trim().notEmpty().isLength({ max: 160 }),
    body("vehiclePlate").optional({ values: "null" }).isString().isLength({ max: 30 }),
    body("driverName").optional({ values: "null" }).isString().isLength({ max: 160 }),
    body("driverPhone").optional({ values: "null" }).isString().isLength({ max: 40 }),
    body("stopCount").optional().isInt({ min: 0, max: 1000 }),
    body("capacity").optional().isInt({ min: 0, max: 10000 }),
    body("status").optional().isIn(["ACTIVE", "MAINTENANCE", "INACTIVE"]),
  ],
  validate,
  controller.updateTransportRoute
);

router.get(
  "/payroll/staff",
  financeStaff,
  controller.getPayrollStaff
);
router.get(
  "/payroll",
  financeStaff,
  [query("period").optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/)],
  validate,
  controller.getPayroll
);
router.post(
  "/payroll",
  financeStaff,
  [
    body("staffId").isUUID(),
    body("period").matches(/^\d{4}-(0[1-9]|1[0-2])$/),
    body("basicSalary").isFloat({ min: 0, max: 100000000 }),
    body("allowances").optional().isFloat({ min: 0, max: 100000000 }),
    body("deductions").optional().isFloat({ min: 0, max: 100000000 }),
  ],
  validate,
  controller.createPayrollEntry
);
router.patch(
  "/payroll/:id/paid",
  financeStaff,
  [param("id").isUUID()],
  validate,
  controller.markPayrollPaid
);

module.exports = router;
