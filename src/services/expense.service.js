const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");
const { generateExpenseNumber } = require("../utils/generateId");
const ledgerService = require("./ledger.service");

// ── Categories ──────────────────────────────────────────────────

const getCategories = async (schoolId, { includeInactive = false } = {}) => {
  return prisma.expenseCategory.findMany({
    where: { schoolId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
  });
};

const createCategory = async (schoolId, data) => {
  const { name } = data;
  if (!name || !name.trim()) throw createError("Category name is required.", 422);

  const existing = await prisma.expenseCategory.findUnique({
    where: { schoolId_name: { schoolId, name: name.trim() } },
  });
  if (existing) throw createError("A category with this name already exists.", 409);

  return prisma.expenseCategory.create({
    data: { schoolId, name: name.trim() },
  });
};

const updateCategory = async (schoolId, categoryId, data) => {
  const cat = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, schoolId },
  });
  if (!cat) throw createError("Category not found.", 404);

  const { name, isActive } = data;
  return prisma.expenseCategory.update({
    where: { id: categoryId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(isActive !== undefined && { isActive }),
    },
  });
};

const deactivateCategory = async (schoolId, categoryId) => {
  const cat = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, schoolId },
  });
  if (!cat) throw createError("Category not found.", 404);

  return prisma.expenseCategory.update({
    where: { id: categoryId },
    data: { isActive: false },
  });
};

// ── Expenses ────────────────────────────────────────────────────

const recordExpense = async (schoolId, recordedById, data) => {
  const { expenseCategoryId, vendor, amount, method, notes, receiptUrl } = data;

  if (!expenseCategoryId) throw createError("expenseCategoryId is required.", 422);
  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) {
    throw createError("A valid amount is required.", 422);
  }

  const category = await prisma.expenseCategory.findFirst({
    where: { id: expenseCategoryId, schoolId },
  });
  if (!category) throw createError("Expense category not found.", 404);
  if (!category.isActive) throw createError("This expense category is inactive.", 422);

  const expenseNumber = await generateExpenseNumber(schoolId);

  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        schoolId,
        expenseCategoryId,
        vendor: vendor || null,
        amount: numericAmount,
        method: method || "CASH",
        notes: notes || null,
        receiptUrl: receiptUrl || null,
        expenseNumber,
        recordedById,
      },
      include: {
        expenseCategory: { select: { id: true, name: true } },
        recordedBy: { select: { id: true, email: true } },
      },
    });

    const account = await ledgerService.resolveAccountForMethod(
      schoolId,
      expense.method,
      tx
    );

    await ledgerService.postToLedger(
      {
        schoolId,
        sourceType: "EXPENSE",
        sourceId: expense.id,
        accountId: account.id,
        type: "OUT",
        amount: numericAmount,
        expenseCategoryId,
        description: `Expense — ${category.name}${vendor ? ` (${vendor})` : ""} [${expenseNumber}]`,
        recordedById,
      },
      tx
    );

    return expense;
  });
};

const updateExpense = async (schoolId, expenseId, data) => {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, schoolId },
  });
  if (!expense) throw createError("Expense not found.", 404);

  const { expenseCategoryId, vendor, amount, method, notes, receiptUrl } = data;

  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...(expenseCategoryId !== undefined && { expenseCategoryId }),
      ...(vendor !== undefined && { vendor }),
      ...(amount !== undefined && amount !== null && { amount: Number(amount) }),
      ...(method !== undefined && { method }),
      ...(notes !== undefined && { notes }),
      ...(receiptUrl !== undefined && { receiptUrl }),
    },
  });
};

const deleteExpense = async (schoolId, expenseId) => {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, schoolId },
  });
  if (!expense) throw createError("Expense not found.", 404);

  return prisma.$transaction(async (tx) => {
    await ledgerService.reverseSource(schoolId, "EXPENSE", expenseId, tx);
    await tx.expense.delete({ where: { id: expenseId } });
    return { id: expenseId, deleted: true };
  });
};

const getExpenses = async (schoolId, query) => {
  const { skip, take, page, limit } = getPagination(query);
  const where = { schoolId };

  if (query.expenseCategoryId) where.expenseCategoryId = query.expenseCategoryId;
  if (query.method) where.method = query.method;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        expenseCategory: { select: { id: true, name: true } },
        recordedBy: { select: { id: true, email: true } },
      },
    }),
    prisma.expense.count({ where }),
  ]);

  return paginatedResponse(expenses, total, page, limit);
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  recordExpense,
  updateExpense,
  deleteExpense,
  getExpenses,
};