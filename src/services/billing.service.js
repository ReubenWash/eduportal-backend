const crypto = require("crypto");
const path = require("path");
const { prisma } = require("../config/db");
const storage = require("../config/fileStorage");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");
const emails = require("./billingEmail.service");

const EXPIRING_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const METHODS = ["MOMO", "BANK_TRANSFER"];

// ── helpers ────────────────────────────────────────────────────
const num = (v) => (v === null || v === undefined ? null : Number(v));
const round2 = (n) => Math.round(n * 100) / 100;

// Add calendar months (UTC), clamping the day: Jan 31 + 1 month = Feb 28/29.
const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
};

// UNPAID (never paid) | ACTIVE | EXPIRING | GRACE | EXPIRED
const computePlanStatus = (planRenewsAt, graceDays, now = new Date()) => {
  if (!planRenewsAt) return "UNPAID";
  const renews = new Date(planRenewsAt);
  if (now <= renews) return renews - now <= EXPIRING_SOON_DAYS * DAY_MS ? "EXPIRING" : "ACTIVE";
  if (now - renews <= graceDays * DAY_MS) return "GRACE";
  return "EXPIRED";
};

const daysRemaining = (planRenewsAt, now = new Date()) =>
  planRenewsAt ? Math.ceil((new Date(planRenewsAt) - now) / DAY_MS) : null;

const getSettings = async () =>
  prisma.billingSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });

const serializeSettings = (s) => ({
  pricePerStudent: num(s.pricePerStudent),
  currency: s.currency,
  gracePeriodDays: s.gracePeriodDays,
  momo: { network: s.momoNetwork, number: s.momoNumber, accountName: s.momoAccountName },
  bank: { name: s.bankName, accountName: s.bankAccountName, accountNumber: s.bankAccountNumber, branch: s.bankBranch },
  instructions: s.instructions,
  updatedAt: s.updatedAt,
});

const serializePayment = (p, { admin = false } = {}) => {
  const out = {
    id: p.id,
    reference: p.reference,
    status: p.status,
    studentCount: p.studentCount,
    pricePerStudent: num(p.pricePerStudent),
    months: p.months,
    amountExpected: num(p.amountExpected),
    amountReceived: num(p.amountReceived),
    currency: p.currency,
    method: p.method,
    payerName: p.payerName,
    payerPhone: p.payerPhone,
    transactionRef: p.transactionRef,
    paidOn: p.paidOn,
    note: p.note,
    rejectionReason: p.rejectionReason,
    reviewedAt: p.reviewedAt,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    createdAt: p.createdAt,
    proof: { name: p.proofName, mime: p.proofMime },
    proofUrl: admin ? `/admin/billing/payments/${p.id}/proof` : `/billing/payments/${p.id}/proof`,
  };
  if (p.school) out.school = p.school;
  if (admin) {
    out.schoolId = p.schoolId;
    if (p.submittedBy) out.submittedBy = p.submittedBy;
    if (p.reviewedBy) out.reviewedBy = p.reviewedBy;
  }
  return out;
};

const countActiveStudents = (schoolId) => prisma.student.count({ where: { schoolId, status: "ACTIVE" } });

// Real file type check (client-sent mimetype is not trusted).
const detectFileType = (buf) => {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: ".png" };
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return { mime: "image/webp", ext: ".webp" };
  if (buf.slice(0, 5).toString() === "%PDF-") return { mime: "application/pdf", ext: ".pdf" };
  return null;
};

const cleanStr = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw createError(`Value too long (max ${max} characters).`, 400);
  return s;
};

const generateReference = async () => {
  const year = new Date().getUTCFullYear();
  for (let i = 0; i < 8; i++) {
    const ref = `GOR-${year}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    if (!(await prisma.schoolPayment.findUnique({ where: { reference: ref }, select: { id: true } }))) return ref;
  }
  throw createError("Could not generate a payment reference. Please try again.", 500);
};

// ═══════════════════════ SCHOOL ADMIN ═══════════════════════════

const getSchoolBilling = async (schoolId) => {
  const [school, settings, activeStudents, pending, recent] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, planRenewsAt: true } }),
    getSettings(),
    countActiveStudents(schoolId),
    prisma.schoolPayment.findFirst({ where: { schoolId, status: "PENDING" }, orderBy: { createdAt: "desc" } }),
    prisma.schoolPayment.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  if (!school) throw createError("School not found.", 404);

  const price = num(settings.pricePerStudent);
  return {
    school: { id: school.id, name: school.name },
    planRenewsAt: school.planRenewsAt,
    planStatus: computePlanStatus(school.planRenewsAt, settings.gracePeriodDays),
    daysRemaining: daysRemaining(school.planRenewsAt),
    activeStudents,
    pricePerStudent: price,
    currency: settings.currency,
    amountDue: round2(activeStudents * price), // one month, current roll
    paymentDetails: serializeSettings(settings),
    pendingPayment: pending ? serializePayment(pending) : null,
    recentPayments: recent.map((p) => serializePayment(p)),
  };
};

const submitPayment = async (user, body, file) => {
  if (!file) throw createError("Proof of payment (image or PDF) is required.", 400);
  const type = detectFileType(file.buffer);
  if (!type) throw createError("Proof must be a valid JPG, PNG, WEBP or PDF file.", 400);

  const months = body.months === undefined || body.months === "" ? 1 : Number(body.months);
  if (!Number.isInteger(months) || months < 1 || months > 12) throw createError("Months must be a whole number from 1 to 12.", 400);

  const method = String(body.method || "").toUpperCase();
  if (!METHODS.includes(method)) throw createError(`Method must be one of: ${METHODS.join(", ")}.`, 400);

  const paidOn = new Date(body.paidOn);
  if (!body.paidOn || Number.isNaN(paidOn.getTime())) throw createError("Date of payment is required.", 400);
  if (paidOn.getTime() > Date.now() + DAY_MS) throw createError("Payment date cannot be in the future.", 400);

  const payerName = cleanStr(body.payerName, 120);
  const payerPhone = cleanStr(body.payerPhone, 30);
  const transactionRef = cleanStr(body.transactionRef, 80);
  const note = cleanStr(body.note, 500);

  const schoolId = user.schoolId;
  const [school, settings, activeStudents, pending] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } }),
    getSettings(),
    countActiveStudents(schoolId),
    prisma.schoolPayment.findFirst({ where: { schoolId, status: "PENDING" }, select: { reference: true } }),
  ]);
  if (pending) throw createError(`You already have a payment awaiting review (${pending.reference}).`, 409);
  if (activeStudents === 0) throw createError("Add students before submitting a payment.", 400);

  if (transactionRef) {
    const dup = await prisma.schoolPayment.findFirst({
      where: { transactionRef: { equals: transactionRef, mode: "insensitive" }, status: { not: "REJECTED" } },
      select: { id: true },
    });
    if (dup) throw createError("This transaction reference has already been submitted.", 409);
  }

  const price = num(settings.pricePerStudent);
  const amountExpected = round2(activeStudents * price * months);
  const reference = await generateReference();
  const proofKey = `payment-proofs/${schoolId}/${reference}${type.ext}`;
  const originalName = path.basename(file.originalname || `proof${type.ext}`).slice(0, 120);

  await storage.save(proofKey, file.buffer);
  let payment;
  try {
    payment = await prisma.schoolPayment.create({
      data: {
        reference, schoolId, submittedById: user.userId,
        studentCount: activeStudents, pricePerStudent: price, months,
        amountExpected, currency: settings.currency, method,
        payerName, payerPhone, transactionRef, paidOn, note,
        proofKey, proofMime: type.mime, proofName: originalName,
      },
    });
  } catch (e) {
    await storage.remove(proofKey).catch(() => {});
    throw e;
  }

  const mailData = { ...payment, schoolName: school.name, amountExpected, pricePerStudent: price };
  emails.notifyAdminsPaymentSubmitted(mailData);
  emails.sendPaymentReceivedEmail(user.email, mailData);
  return serializePayment(payment);
};

const listSchoolPayments = async (schoolId, query) => {
  const { skip, take, page, limit } = getPagination(query);
  const where = { schoolId };
  if (query.status) where.status = String(query.status).toUpperCase();
  const [rows, total] = await Promise.all([
    prisma.schoolPayment.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.schoolPayment.count({ where }),
  ]);
  return paginatedResponse(rows.map((p) => serializePayment(p)), total, page, limit);
};

const getSchoolPayment = async (schoolId, id) => {
  const p = await prisma.schoolPayment.findFirst({ where: { id, schoolId } });
  if (!p) throw createError("Payment not found.", 404);
  return serializePayment(p);
};

// Returns { stream, mime, name } for a proof — school users only see their own school's.
const getProofFile = async ({ id, schoolId = null }) => {
  const p = await prisma.schoolPayment.findFirst({ where: schoolId ? { id, schoolId } : { id } });
  if (!p) throw createError("Payment not found.", 404);
  if (!(await storage.exists(p.proofKey))) throw createError("Proof file is missing.", 404);
  return { stream: storage.stream(p.proofKey), mime: p.proofMime, name: p.proofName };
};

// ═══════════════════════ SUPER ADMIN ════════════════════════════

const OPTIONAL_TEXT = {
  momoNetwork: 40, momoNumber: 30, momoAccountName: 120,
  bankName: 120, bankAccountName: 120, bankAccountNumber: 40, bankBranch: 120, instructions: 1000,
};

const getSettingsView = async () => serializeSettings(await getSettings());

const updateSettings = async (adminId, body) => {
  const data = { updatedById: adminId };
  if (body.pricePerStudent !== undefined) {
    const price = Number(body.pricePerStudent);
    if (!(price > 0 && price <= 10000)) throw createError("Price per student must be greater than 0.", 400);
    data.pricePerStudent = round2(price);
  }
  if (body.gracePeriodDays !== undefined) {
    const g = Number(body.gracePeriodDays);
    if (!Number.isInteger(g) || g < 0 || g > 90) throw createError("Grace period must be 0 to 90 days.", 400);
    data.gracePeriodDays = g;
  }
  if (body.currency !== undefined) data.currency = cleanStr(body.currency, 3)?.toUpperCase() || "GHS";
  for (const [field, max] of Object.entries(OPTIONAL_TEXT)) {
    if (body[field] !== undefined) data[field] = cleanStr(body[field], max);
  }
  await getSettings();
  const updated = await prisma.billingSettings.update({ where: { id: "default" }, data });
  return serializeSettings(updated);
};

const adminInclude = {
  school: { select: { id: true, name: true, email: true, phone: true } },
  submittedBy: { select: { id: true, email: true } },
  reviewedBy: { select: { id: true, email: true } },
};

const listPayments = async (query) => {
  const { skip, take, page, limit } = getPagination(query);
  const where = {};
  if (query.status) where.status = String(query.status).toUpperCase();
  if (query.schoolId) where.schoolId = String(query.schoolId);
  if (query.q) {
    const q = String(query.q).trim();
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { transactionRef: { contains: q, mode: "insensitive" } },
      { school: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.schoolPayment.findMany({ where, include: adminInclude, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.schoolPayment.count({ where }),
  ]);
  return paginatedResponse(rows.map((p) => serializePayment(p, { admin: true })), total, page, limit);
};

const getPayment = async (id) => {
  const p = await prisma.schoolPayment.findUnique({ where: { id }, include: adminInclude });
  if (!p) throw createError("Payment not found.", 404);
  return serializePayment(p, { admin: true });
};

const periodEndLabel = (d) => new Date(d).toISOString().slice(0, 10);

const approvePayment = async (id, adminId, body = {}) => {
  const existing = await prisma.schoolPayment.findUnique({ where: { id }, include: { school: true, submittedBy: { select: { email: true } } } });
  if (!existing) throw createError("Payment not found.", 404);

  const amountReceived = body.amountReceived === undefined || body.amountReceived === "" ? num(existing.amountExpected) : Number(body.amountReceived);
  if (!(amountReceived > 0)) throw createError("Amount received must be greater than 0.", 400);
  const grantMonths = body.months === undefined || body.months === "" ? existing.months : Number(body.months);
  if (!Number.isInteger(grantMonths) || grantMonths < 1 || grantMonths > 12) throw createError("Months must be a whole number from 1 to 12.", 400);

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    // Claim the payment: only one request can move it out of PENDING.
    const claimed = await tx.schoolPayment.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", reviewedById: adminId, reviewedAt: now, amountReceived },
    });
    if (claimed.count === 0) throw createError("This payment has already been reviewed.", 409);

    const school = await tx.school.findUnique({ where: { id: existing.schoolId }, select: { planRenewsAt: true } });
    // Early renewal extends from the current end date; a lapsed plan restarts from today.
    const periodStart = school.planRenewsAt && school.planRenewsAt > now ? school.planRenewsAt : now;
    const periodEnd = addMonths(periodStart, grantMonths);

    await tx.school.update({ where: { id: existing.schoolId }, data: { planRenewsAt: periodEnd } });
    return tx.schoolPayment.update({ where: { id }, data: { periodStart, periodEnd }, include: adminInclude });
  });

  const mailData = { ...result, schoolName: existing.school.name };
  new Set([existing.submittedBy.email, existing.school.email]).forEach((to) => emails.sendPaymentApprovedEmail(to, mailData));
  prisma.notification.create({
    data: {
      userId: existing.submittedById,
      title: "Payment approved",
      message: `Payment ${existing.reference} was approved. Your plan is active until ${periodEndLabel(result.periodEnd)}.`,
      type: "success",
    },
  }).catch(() => {});

  return serializePayment(result, { admin: true });
};

const rejectPayment = async (id, adminId, body = {}) => {
  const reason = cleanStr(body.reason, 500);
  if (!reason || reason.length < 3) throw createError("A reason for rejection is required.", 400);

  const existing = await prisma.schoolPayment.findUnique({ where: { id }, include: { school: true, submittedBy: { select: { email: true } } } });
  if (!existing) throw createError("Payment not found.", 404);

  const claimed = await prisma.schoolPayment.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", rejectionReason: reason, reviewedById: adminId, reviewedAt: new Date() },
  });
  if (claimed.count === 0) throw createError("This payment has already been reviewed.", 409);

  const updated = await prisma.schoolPayment.findUnique({ where: { id }, include: adminInclude });
  const mailData = { ...updated, schoolName: existing.school.name };
  new Set([existing.submittedBy.email, existing.school.email]).forEach((to) => emails.sendPaymentRejectedEmail(to, mailData));
  prisma.notification.create({
    data: { userId: existing.submittedById, title: "Payment not approved", message: `Payment ${existing.reference} was not approved: ${reason}`, type: "warning" },
  }).catch(() => {});

  return serializePayment(updated, { admin: true });
};

const getOverview = async () => {
  const settings = await getSettings();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);
  const graceCutoff = new Date(now.getTime() - settings.gracePeriodDays * DAY_MS);
  const activeSchool = { status: "ACTIVE" };

  const [pending, pendingSum, monthSum, totalSum, unpaid, expiring, lapsed, expiringList] = await Promise.all([
    prisma.schoolPayment.count({ where: { status: "PENDING" } }),
    prisma.schoolPayment.aggregate({ where: { status: "PENDING" }, _sum: { amountExpected: true } }),
    prisma.schoolPayment.aggregate({ where: { status: "APPROVED", reviewedAt: { gte: monthStart } }, _sum: { amountReceived: true }, _count: true }),
    prisma.schoolPayment.aggregate({ where: { status: "APPROVED" }, _sum: { amountReceived: true } }),
    prisma.school.count({ where: { ...activeSchool, planRenewsAt: null } }),
    prisma.school.count({ where: { ...activeSchool, planRenewsAt: { gte: now, lte: soon } } }),
    prisma.school.count({ where: { ...activeSchool, planRenewsAt: { lt: graceCutoff } } }),
    prisma.school.findMany({
      where: { ...activeSchool, planRenewsAt: { lte: soon } },
      select: { id: true, name: true, planRenewsAt: true, email: true },
      orderBy: { planRenewsAt: "asc" },
      take: 10,
    }),
  ]);

  return {
    currency: settings.currency,
    pricePerStudent: num(settings.pricePerStudent),
    pendingCount: pending,
    pendingAmount: num(pendingSum._sum.amountExpected) || 0,
    approvedThisMonth: { count: monthSum._count, amount: num(monthSum._sum.amountReceived) || 0 },
    approvedTotal: num(totalSum._sum.amountReceived) || 0,
    schoolsUnpaid: unpaid,
    schoolsExpiringSoon: expiring,
    schoolsExpired: lapsed,
    needsAttention: expiringList,
  };
};

// ═══════════════════ ENFORCEMENT (optional) ═════════════════════

// Returns a message if this request should be blocked for billing reasons, else null.
// Off unless BILLING_ENFORCEMENT=true. Read-only requests and /billing, /notifications always pass.
const getBillingBlock = async (school, req, now = new Date()) => {
  if (process.env.BILLING_ENFORCEMENT !== "true") return null;
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return null;
  if (/^\/api\/v1\/(billing|notifications)(\/|$|\?)/.test(req.originalUrl)) return null;

  const { gracePeriodDays: grace } = await getSettings();
  const trial = Number(process.env.BILLING_TRIAL_DAYS ?? 14);
  const status = computePlanStatus(school.planRenewsAt, grace, now);

  if (status === "EXPIRED") return "Your school's plan has expired. Renew from the Billing page to continue making changes. Your records stay viewable.";
  if (status === "UNPAID" && now - new Date(school.createdAt) > trial * DAY_MS) {
    return "Your free setup period has ended. Please make your first payment from the Billing page to continue making changes.";
  }
  return null;
};

module.exports = {
  addMonths, computePlanStatus, detectFileType, getBillingBlock,
  getSchoolBilling, submitPayment, listSchoolPayments, getSchoolPayment, getProofFile,
  getSettings, getSettingsView, updateSettings, listPayments, getPayment, approvePayment, rejectPayment, getOverview,
};