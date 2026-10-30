const expenseService = require("../services/expense.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");

const getSchoolId = (req) => {
  const schoolId = req.user.schoolId;
  if (!schoolId) throw createError("No school associated with this account.", 400);
  return schoolId;
};

// Categories
const listCategories = async (req, res) => {
  const cats = await expenseService.getCategories(getSchoolId(req), {
    includeInactive: req.query.includeInactive === "true",
  });
  return sendSuccess(res, 200, "Expense categories fetched.", cats);
};
const createCategory = async (req, res) => {
  const cat = await expenseService.createCategory(getSchoolId(req), req.body);
  return sendSuccess(res, 201, "Expense category created.", cat);
};
const updateCategory = async (req, res) => {
  const cat = await expenseService.updateCategory(getSchoolId(req), req.params.id, req.body);
  return sendSuccess(res, 200, "Expense category updated.", cat);
};
const deactivateCategory = async (req, res) => {
  const cat = await expenseService.deactivateCategory(getSchoolId(req), req.params.id);
  return sendSuccess(res, 200, "Expense category deactivated.", cat);
};

// Expenses
const listExpenses = async (req, res) => {
  const result = await expenseService.getExpenses(getSchoolId(req), req.query);
  return sendSuccess(res, 200, "Expenses fetched.", result);
};
const recordExpense = async (req, res) => {
  const expense = await expenseService.recordExpense(
    getSchoolId(req),
    req.user.userId,
    req.body
  );
  return sendSuccess(res, 201, "Expense recorded.", expense);
};
const updateExpense = async (req, res) => {
  const expense = await expenseService.updateExpense(getSchoolId(req), req.params.id, req.body);
  return sendSuccess(res, 200, "Expense updated.", expense);
};
const deleteExpense = async (req, res) => {
  const result = await expenseService.deleteExpense(getSchoolId(req), req.params.id);
  return sendSuccess(res, 200, "Expense deleted.", result);
};

module.exports = {
  listCategories, createCategory, updateCategory, deactivateCategory,
  listExpenses, recordExpense, updateExpense, deleteExpense,
};