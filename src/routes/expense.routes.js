const express = require("express");
const router = express.Router();
const controller = require("../controllers/expense.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { isFinanceStaff } = require("../middleware/roles");
const { requirePermission } = require("../middleware/permission");
const validate = require("../middleware/validate");
const {
  createCategoryValidator, updateCategoryValidator,
  recordExpenseValidator, updateExpenseValidator,
} = require("../validators/expense.validator");

router.use(authenticate, tenantScope, isFinanceStaff);

// Categories — admin-only manage (manage_expenses covers both categories
// and expenses per Phase 1 spec; the Accountant role gets manage_expenses
// so they can record and categorize their own expenses).
router.get("/categories", requirePermission("view_ledger"), controller.listCategories);
router.post("/categories", requirePermission("manage_expenses"), createCategoryValidator, validate, controller.createCategory);
router.patch("/categories/:id", requirePermission("manage_expenses"), updateCategoryValidator, validate, controller.updateCategory);
router.delete("/categories/:id", requirePermission("manage_expenses"), controller.deactivateCategory);

// Expenses
router.get("/", requirePermission("view_ledger"), controller.listExpenses);
router.post("/", requirePermission("manage_expenses"), recordExpenseValidator, validate, controller.recordExpense);
router.patch("/:id", requirePermission("manage_expenses"), updateExpenseValidator, validate, controller.updateExpense);
router.delete("/:id", requirePermission("manage_expenses"), controller.deleteExpense);

module.exports = router;