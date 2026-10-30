const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

// Map a FinancialPaymentMethod to the LedgerAccount type it flows through.
const METHOD_TO_ACCOUNT_TYPE = {
  CASH:          "CASH",
  MOMO:          "MOMO",
  BANK_TRANSFER: "BANK",
  CHEQUE:        "BANK",
  OTHER:         "CASH",
};

const ACCOUNT_TYPE_LABEL = {
  CASH: "Cash",
  BANK: "Bank",
  MOMO: "MoMo",
};

// Lazily create the school's default Cash / Bank / MoMo account if it
// doesn't exist. Idempotent — safe to call from any write path.
const ensureAccountForType = async (schoolId, type, tx = prisma) => {
  const existing = await tx.ledgerAccount.findFirst({
    where: { schoolId, type },
  });
  if (existing) return existing;

  return tx.ledgerAccount.create({
    data: { schoolId, name: ACCOUNT_TYPE_LABEL[type], type },
  });
};

// Resolve the correct account for a given payment method, seeding it
// lazily so existing schools don't need a data migration.
const resolveAccountForMethod = async (schoolId, method, tx = prisma) => {
  const type = METHOD_TO_ACCOUNT_TYPE[method] || "CASH";
  return ensureAccountForType(schoolId, type, tx);
};

const seedDefaultAccounts = async (schoolId) => {
  await Promise.all([
    ensureAccountForType(schoolId, "CASH"),
    ensureAccountForType(schoolId, "BANK"),
    ensureAccountForType(schoolId, "MOMO"),
  ]);
};

/**
 * Post a single-entry ledger line.
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {"FEE_PAYMENT"|"CANTEEN_SALE"|"WALLET_TOPUP"|"EXPENSE"|"MANUAL"} params.sourceType
 * @param {string|null} params.sourceId     — id of the source record (for idempotency)
 * @param {string} params.accountId         — LedgerAccount id
 * @param {"IN"|"OUT"} params.type
 * @param {number|string} params.amount     — must be > 0
 * @param {string|null} [params.financialCategoryId]
 * @param {string|null} [params.expenseCategoryId]
 * @param {string|null} [params.description]
 * @param {string} params.recordedById
 * @param {Date}   [params.date]
 * @param {object} [tx]                     — Prisma transaction client (defaults to prisma)
 */
const postToLedger = async (params, tx = prisma) => {
  const {
    schoolId,
    sourceType,
    sourceId,
    accountId,
    type,
    amount,
    financialCategoryId,
    expenseCategoryId,
    description,
    recordedById,
    date,
  } = params;

  if (!schoolId) throw createError("schoolId is required to post a ledger entry.", 422);
  if (!sourceType) throw createError("sourceType is required.", 422);
  if (!accountId) throw createError("accountId is required.", 422);
  if (type !== "IN" && type !== "OUT") throw createError("type must be IN or OUT.", 422);

  const numericAmount = Number(amount);
  if (!numericAmount || numericAmount <= 0) {
    throw createError("Ledger entry amount must be greater than zero.", 422);
  }

  const account = await tx.ledgerAccount.findFirst({
    where: { id: accountId, schoolId, isActive: true },
  });
  if (!account) throw createError("Ledger account not found or inactive.", 404);

  // Idempotency guard
  if (sourceId) {
    const existing = await tx.ledgerEntry.findFirst({
      where: { schoolId, sourceType, sourceId },
    });
    if (existing) {
      throw createError(
        `Ledger entry already exists for ${sourceType}:${sourceId}.`,
        409
      );
    }
  }

  return tx.ledgerEntry.create({
    data: {
      schoolId,
      accountId,
      date: date || new Date(),
      type,
      amount: numericAmount,
      financialCategoryId: financialCategoryId || null,
      expenseCategoryId: expenseCategoryId || null,
      sourceType,
      sourceId: sourceId || null,
      description: description || null,
      recordedById,
    },
    include: {
      account: true,
      financialCategory: { select: { id: true, name: true } },
      expenseCategory: { select: { id: true, name: true } },
    },
  });
};

/**
 * Delete ledger entries for a given source. Used when a source record
 * (FinancialTransaction, Expense) is deleted and we want the ledger
 * to stop counting it. Audit log captures the deletion elsewhere.
 */
const reverseSource = async (schoolId, sourceType, sourceId, tx = prisma) => {
  return tx.ledgerEntry.deleteMany({
    where: { schoolId, sourceType, sourceId },
  });
};

/**
 * Account balance for each LedgerAccount, computed from entries.
 * IN increases, OUT decreases. This is the cash position per account.
 */
const getAccountBalances = async (schoolId) => {
  const accounts = await prisma.ledgerAccount.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
  });

  const sums = await prisma.ledgerEntry.groupBy({
    by: ["accountId", "type"],
    where: { schoolId },
    _sum: { amount: true },
  });

  const byAccount = new Map();
  for (const s of sums) {
    if (!byAccount.has(s.accountId)) {
      byAccount.set(s.accountId, { IN: 0, OUT: 0 });
    }
    byAccount.get(s.accountId)[s.type] = Number(s._sum.amount || 0);
  }

  return accounts.map((acc) => {
    const { IN = 0, OUT = 0 } = byAccount.get(acc.id) || {};
    return {
      id: acc.id,
      name: acc.name,
      type: acc.type,
      isActive: acc.isActive,
      totalIn: IN,
      totalOut: OUT,
      balance: IN - OUT,
    };
  });
};

/**
 * Trial balance — totals for IN, OUT, and net across the whole school.
 * Cheap proof-of-correctness: because every entry is a single row,
 * net = SUM(IN) − SUM(OUT) across all entries. If this number drifts
 * from what you expect, something double-posted.
 */
const getTrialBalance = async (schoolId) => {
  const sums = await prisma.ledgerEntry.groupBy({
    by: ["type"],
    where: { schoolId },
    _sum: { amount: true },
    _count: true,
  });

  const totals = { IN: 0, OUT: 0 };
  let count = 0;
  for (const s of sums) {
    totals[s.type] = Number(s._sum.amount || 0);
    count += s._count;
  }

  return {
    totalIn: totals.IN,
    totalOut: totals.OUT,
    net: totals.IN - totals.OUT,
    entryCount: count,
  };
};

/**
 * Daybook — the chronological ledger, with filters.
 */
const getDaybook = async (schoolId, query) => {
  const where = { schoolId };

  if (query.accountId) where.accountId = query.accountId;
  if (query.sourceType) where.sourceType = query.sourceType;
  if (query.type) where.type = query.type;

  if (query.from || query.to) {
    where.date = {};
    if (query.from) where.date.gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      where.date.lte = to;
    }
  }

  if (query.financialCategoryId) where.financialCategoryId = query.financialCategoryId;
  if (query.expenseCategoryId) where.expenseCategoryId = query.expenseCategoryId;

  const entries = await prisma.ledgerEntry.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      account: { select: { id: true, name: true, type: true } },
      financialCategory: { select: { id: true, name: true } },
      expenseCategory: { select: { id: true, name: true } },
      recordedBy: { select: { id: true, email: true } },
    },
  });

  return entries;
};

const getAccounts = async (schoolId, { includeInactive = false } = {}) => {
  await seedDefaultAccounts(schoolId);
  return prisma.ledgerAccount.findMany({
    where: { schoolId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
  });
};

module.exports = {
  postToLedger,
  reverseSource,
  resolveAccountForMethod,
  ensureAccountForType,
  seedDefaultAccounts,
  getAccountBalances,
  getTrialBalance,
  getDaybook,
  getAccounts,
  METHOD_TO_ACCOUNT_TYPE,
};