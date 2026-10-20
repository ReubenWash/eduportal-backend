const express = require("express");
const router = express.Router();
const controller = require("../controllers/finance.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { isFinanceStaff } = require("../middleware/roles");
const { requirePermission } = require("../middleware/permission");
const validate = require("../middleware/validate");
const {
  createCategoryValidator,
  updateCategoryValidator,
  recordTransactionValidator,
  updateTransactionValidator,
} = require("../validators/finance.validator");

router.use(authenticate, tenantScope, isFinanceStaff);

// Categories — only manage_finance_categories can create/edit/deactivate.
// By design, the seeded "Accountant" role has manage_finance but NOT
// manage_finance_categories, so an accountant can reach these routes
// (isFinanceStaff passes) but gets blocked by the permission check —
// category structure stays an admin decision.
router.get("/categories",         requirePermission("view_finance"), controller.listCategories);
router.post("/categories",        requirePermission("manage_finance_categories"), createCategoryValidator, validate, controller.createCategory);
router.patch("/categories/:id",   requirePermission("manage_finance_categories"), updateCategoryValidator, validate, controller.updateCategory);
router.delete("/categories/:id",  requirePermission("manage_finance_categories"), controller.deactivateCategory);

// Transactions — both admin and accountant can record/view with
// manage_finance / view_finance respectively.
router.get("/transactions",       requirePermission("view_finance"), controller.listTransactions);
router.post("/transactions",      requirePermission("manage_finance"), recordTransactionValidator, validate, controller.recordTransaction);
router.patch("/transactions/:id", requirePermission("manage_finance"), updateTransactionValidator, validate, controller.updateTransaction);
router.delete("/transactions/:id",requirePermission("manage_finance"), controller.deleteTransaction);

// A single student's full picture — paid/outstanding per category. Same
// shape the student/parent self-service endpoints return (see
// student.routes.js / guardian.routes.js), but reachable by finance staff
// for any student in the school rather than only your own record.
router.get("/students/:studentId/summary", requirePermission("view_finance"), controller.getStudentSummary);

module.exports = router;
