const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");
const { generateReceiptNumber } = require("../utils/generateId");
const ledgerService = require("./ledger.service"); // ← Phase 1
const feeInvoiceService = require("./fee-invoice.service");

// ─────────────────────────────────────────────────────
// CATEGORIES — school-admin-defined. "School Fees" is just one possible
// name; nothing here assumes fees specifically.
// ─────────────────────────────────────────────────────

const getCategories = async (schoolId, { includeInactive = false } = {}) => {
  return prisma.financialCategory.findMany({
    where: { schoolId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
  });
};

const createCategory = async (schoolId, data) => {
  const { name, description, expectedAmount } = data;
  if (!name || !name.trim()) throw createError("Category name is required.", 422);

  const existing = await prisma.financialCategory.findUnique({
    where: { schoolId_name: { schoolId, name: name.trim() } },
  });
  if (existing) throw createError("A category with this name already exists.", 409);

  return prisma.financialCategory.create({
    data: {
      schoolId,
      name: name.trim(),
      description: description || null,
      expectedAmount: expectedAmount !== undefined && expectedAmount !== null && expectedAmount !== ""
        ? Number(expectedAmount)
        : null,
    },
  });
};

const updateCategory = async (schoolId, categoryId, data) => {
  const category = await prisma.financialCategory.findFirst({ where: { id: categoryId, schoolId } });
  if (!category) throw createError("Category not found.", 404);

  const { name, description, expectedAmount, isActive } = data;
  return prisma.financialCategory.update({
    where: { id: categoryId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...(expectedAmount !== undefined && {
        expectedAmount: expectedAmount === null || expectedAmount === "" ? null : Number(expectedAmount),
      }),
      ...(isActive !== undefined && { isActive }),
    },
  });
};

// Categories are never hard-deleted — a transaction may already reference
// one, and deleting it would corrupt the ledger's history. "Deleting" a
// category just deactivates it so it stops showing up for new entries.
const deactivateCategory = async (schoolId, categoryId) => {
  const category = await prisma.financialCategory.findFirst({ where: { id: categoryId, schoolId } });
  if (!category) throw createError("Category not found.", 404);

  return prisma.financialCategory.update({
    where: { id: categoryId },
    data: { isActive: false },
  });
};

// ─────────────────────────────────────────────────────
// TRANSACTIONS — the actual payment ledger an accountant records against.
// ─────────────────────────────────────────────────────

const recordTransaction = async (schoolId, recordedById, data) => {
  const { studentId, categoryId, termId, feeInvoiceId, amount, method, reference, notes } = data;
  const numericAmount = Number(amount);

  if (!studentId) throw createError("studentId is required.", 422);
  if (!categoryId) throw createError("categoryId is required.", 422);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw createError("A valid amount is required.", 422);

  const [student, category] = await Promise.all([
    prisma.student.findFirst({ where: { id: studentId, schoolId } }),
    prisma.financialCategory.findFirst({ where: { id: categoryId, schoolId } }),
  ]);
  if (!student) throw createError("Student not found.", 404);
  if (!category) throw createError("Category not found.", 404);
  if (!category.isActive) throw createError("This category is no longer active.", 422);

  const receiptNumber = await generateReceiptNumber(schoolId);
  let resolvedTermId = termId || null;

  return feeInvoiceService.runSerializable(async (tx) => {
    if (feeInvoiceId) {
      const invoice = await tx.feeInvoice.findFirst({
        where: { id: feeInvoiceId, schoolId },
        include: {
          items: { select: { categoryId: true, amount: true } },
          concessions: { select: { amount: true } },
          transactions: { select: { amount: true, categoryId: true } },
        },
      });
      if (!invoice) throw createError("Fee invoice not found.", 404);
      if (invoice.studentId !== studentId || invoice.termId !== (termId || invoice.termId)) {
        throw createError("Payment details do not match this invoice.", 422);
      }
      resolvedTermId = invoice.termId;
      if (!invoice.items.some((item) => item.categoryId === categoryId)) {
        throw createError("Select a category included in this invoice.", 422);
      }
      const { balance } = feeInvoiceService.getInvoiceTotals(invoice);
      if (numericAmount > balance) {
        throw createError("Payment exceeds the remaining invoice balance.", 422);
      }
      const categoryBalance = feeInvoiceService.getInvoiceCategoryTotals(invoice)[categoryId]?.outstanding || 0;
      if (numericAmount > categoryBalance) {
        throw createError("Payment exceeds the remaining balance for this fee category.", 422);
      }
    }

    const txn = await tx.financialTransaction.create({
      data: {
        schoolId,
        studentId,
        categoryId,
        termId: resolvedTermId,
        feeInvoiceId: feeInvoiceId || null,
        amount: numericAmount,
        method: method || "CASH",
        reference: reference || null,
        receiptNumber,
        notes: notes || null,
        recordedById,
      },
      include: {
        category: { select: { id: true, name: true } },
        student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
        recordedBy: { select: { id: true, email: true } },
      },
    });

    // ── Phase 1: post to single-entry ledger ──
    const account = await ledgerService.resolveAccountForMethod(
      schoolId,
      txn.method,
      tx
    );

    await ledgerService.postToLedger(
      {
        schoolId,
        sourceType: "FEE_PAYMENT",
        sourceId: txn.id,
        accountId: account.id,
        type: "IN",
        amount: txn.amount,
        financialCategoryId: txn.categoryId,
        description: `Fee payment — ${student.firstName} ${student.lastName} (${receiptNumber})`,
        recordedById,
      },
      tx
    );

    if (feeInvoiceId) {
      await feeInvoiceService.refreshInvoiceStatus(tx, schoolId, feeInvoiceId);
    }
    return txn;
  }, "The invoice or payment was updated at the same time. Refresh and try again.");
};

const updateTransaction = async (schoolId, transactionId, data) => {
  const txn = await prisma.financialTransaction.findFirst({ where: { id: transactionId, schoolId } });
  if (!txn) throw createError("Transaction not found.", 404);
  if (txn.feeInvoiceId) {
    throw createError("Invoice payments cannot be edited. Delete and re-record the payment instead.", 422);
  }

  const { amount, method, reference, notes } = data;
  return prisma.financialTransaction.update({
    where: { id: transactionId },
    data: {
      ...(amount !== undefined && amount !== null && { amount: Number(amount) }),
      ...(method !== undefined && { method }),
      ...(reference !== undefined && { reference }),
      ...(notes !== undefined && { notes }),
    },
  });
};

// Transactions are never edited away silently either — a correction should
// leave a trail. Deleting is allowed (mistakes do happen — wrong student,
// duplicate entry) but requires a reason, which goes into the audit log
// the caller (controller) is expected to also write via existing
// audit-logging middleware/conventions elsewhere in this codebase.
//
// Phase 1: deleting a fee payment also reverses its ledger entry so the
// daybook stays consistent with the financial records.
const deleteTransaction = async (schoolId, transactionId) => {
  const txn = await prisma.financialTransaction.findFirst({ where: { id: transactionId, schoolId } });
  if (!txn) throw createError("Transaction not found.", 404);

  return prisma.$transaction(async (tx) => {
    await ledgerService.reverseSource(schoolId, "FEE_PAYMENT", transactionId, tx);
    await tx.financialTransaction.delete({ where: { id: transactionId } });
    if (txn.feeInvoiceId) {
      await feeInvoiceService.refreshInvoiceStatus(tx, schoolId, txn.feeInvoiceId);
    }
    return { id: transactionId, deleted: true };
  }, { isolationLevel: "Serializable" });
};

const getTransactions = async (schoolId, query) => {
  const { skip, take, page, limit } = getPagination(query);
  const where = { schoolId };
  if (query.studentId) where.studentId = query.studentId;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.termId) where.termId = query.termId;
  if (query.method) where.method = query.method;

  const [transactions, total] = await Promise.all([
    prisma.financialTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        category: { select: { id: true, name: true } },
        student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
        recordedBy: { select: { id: true, email: true } },
      },
    }),
    prisma.financialTransaction.count({ where }),
  ]);

  return paginatedResponse(transactions, total, page, limit);
};

// ─────────────────────────────────────────────────────
// STUDENT SUMMARY — what a student/parent sees: per category, what's been
// paid, and (where the category has an expectedAmount) what's outstanding.
// ─────────────────────────────────────────────────────

const getStudentFinanceSummary = async (schoolId, studentId) => {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw createError("Student not found.", 404);

  const [categories, transactions, feeInvoices] = await Promise.all([
    prisma.financialCategory.findMany({ where: { schoolId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.financialTransaction.findMany({
      where: { schoolId, studentId },
      orderBy: { createdAt: "desc" },
      include: { category: { select: { id: true, name: true } } },
    }),
    prisma.feeInvoice.findMany({
      where: { schoolId, studentId },
      orderBy: { dueDate: "desc" },
      include: {
        concessions: { select: { amount: true } },
        items: { select: { categoryId: true, amount: true } },
        transactions: { select: { amount: true, categoryId: true } },
        term: { select: { termNumber: true, academicYear: true } },
      },
    }),
  ]);

  const byCategory = categories.map((cat) => {
    const catTransactions = transactions.filter((t) => t.categoryId === cat.id);
    const invoicedTotals = feeInvoices
      .map((invoice) => feeInvoiceService.getInvoiceCategoryTotals(invoice)[cat.id])
      .filter(Boolean);
    const hasInvoices = invoicedTotals.length > 0;
    const paid = hasInvoices
      ? invoicedTotals.reduce((sum, category) => sum + category.paid, 0)
      : catTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const expected = hasInvoices
      ? invoicedTotals.reduce((sum, category) => sum + category.expected, 0)
      : cat.expectedAmount !== null ? Number(cat.expectedAmount) : null;
    const outstanding = hasInvoices
      ? invoicedTotals.reduce((sum, category) => sum + category.outstanding, 0)
      : expected !== null ? Math.max(0, expected - paid) : null;

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      expected,
      paid,
      outstanding,
      transactionCount: catTransactions.length,
    };
  });

  return {
    studentId,
    categories: byCategory,
    totalPaid: transactions.reduce((sum, t) => sum + Number(t.amount), 0),
    feeInvoices: feeInvoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: Number(invoice.amount),
      dueDate: invoice.dueDate,
      term: invoice.term,
      ...feeInvoiceService.getInvoiceTotals(invoice),
    })),
    recentTransactions: transactions.slice(0, 10).map((t) => ({
      id: t.id,
      categoryName: t.category.name,
      amount: Number(t.amount),
      method: t.method,
      receiptNumber: t.receiptNumber,
      createdAt: t.createdAt,
    })),
  };
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  recordTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactions,
  getStudentFinanceSummary,
};