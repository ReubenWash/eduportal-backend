const financeService = require("../services/finance.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");

const getSchoolId = (req) => {
  const schoolId = req.user.schoolId;
  if (!schoolId) throw createError("No school associated with this account.", 400);
  return schoolId;
};

// ── Categories ──────────────────────────────────────────────────

const listCategories = async (req, res) => {
  const categories = await financeService.getCategories(getSchoolId(req), {
    includeInactive: req.query.includeInactive === "true",
  });
  return sendSuccess(res, 200, "Financial categories fetched.", categories);
};

const createCategory = async (req, res) => {
  const category = await financeService.createCategory(getSchoolId(req), req.body);
  return sendSuccess(res, 201, "Financial category created.", category);
};

const updateCategory = async (req, res) => {
  const category = await financeService.updateCategory(getSchoolId(req), req.params.id, req.body);
  return sendSuccess(res, 200, "Financial category updated.", category);
};

const deactivateCategory = async (req, res) => {
  const category = await financeService.deactivateCategory(getSchoolId(req), req.params.id);
  return sendSuccess(res, 200, "Financial category deactivated.", category);
};

// ── Transactions ─────────────────────────────────────────────────

const listTransactions = async (req, res) => {
  const result = await financeService.getTransactions(getSchoolId(req), req.query);
  return sendSuccess(res, 200, "Transactions fetched.", result);
};

const recordTransaction = async (req, res) => {
  const transaction = await financeService.recordTransaction(getSchoolId(req), req.user.userId, req.body);
  return sendSuccess(res, 201, "Payment recorded.", transaction);
};

const updateTransaction = async (req, res) => {
  const transaction = await financeService.updateTransaction(getSchoolId(req), req.params.id, req.body);
  return sendSuccess(res, 200, "Transaction updated.", transaction);
};

const deleteTransaction = async (req, res) => {
  const result = await financeService.deleteTransaction(getSchoolId(req), req.params.id);
  return sendSuccess(res, 200, "Transaction deleted.", result);
};

const getStudentSummary = async (req, res) => {
  const summary = await financeService.getStudentFinanceSummary(getSchoolId(req), req.params.studentId);
  return sendSuccess(res, 200, "Student finance summary fetched.", summary);
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  listTransactions,
  recordTransaction,
  updateTransaction,
  deleteTransaction,
  getStudentSummary,
};
