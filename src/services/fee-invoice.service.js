const crypto = require("crypto");
const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { sendMail } = require("./email.service");

const money = (value) => Number(Number(value).toFixed(2));
const amountOf = (value) => Number(value || 0);
const runSerializable = async (operation, conflictMessage) => {
  try {
    return await prisma.$transaction(operation, {
      isolationLevel: "Serializable",
      maxWait: 10000,
      timeout: 60000,
    });
  } catch (error) {
    if (error.code === "P2034" || error.code === "P2002") {
      throw createError(conflictMessage, 409);
    }
    throw error;
  }
};
const isPastDue = (date, now = new Date()) => {
  const endOfDueDate = new Date(date);
  endOfDueDate.setUTCHours(23, 59, 59, 999);
  return endOfDueDate < now;
};
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const includeInvoiceDetails = {
  items: { include: { category: { select: { id: true, name: true } } } },
  concessions: true,
  transactions: { select: { amount: true } },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      studentNumber: true,
      guardians: {
        include: {
          guardian: { select: { firstName: true, lastName: true, email: true, isPrimary: true } },
        },
      },
      enrollments: {
        select: { termId: true, class: { select: { id: true, level: true, section: true } } },
      },
    },
  },
  term: { select: { id: true, termNumber: true, academicYear: true } },
};

const getInvoiceTotals = (invoice, now = new Date()) => {
  const amount = amountOf(invoice.amount);
  const concessions = invoice.concessions.reduce((sum, item) => sum + amountOf(item.amount), 0);
  const paid = invoice.transactions.reduce((sum, item) => sum + amountOf(item.amount), 0);
  const totalDue = Math.max(0, money(amount - concessions));
  const balance = Math.max(0, money(totalDue - paid));
  const status = balance === 0
    ? "PAID"
    : isPastDue(invoice.dueDate, now)
      ? "OVERDUE"
      : paid > 0 ? "PARTIALLY_PAID" : "ISSUED";

  return { amount, concessions: money(concessions), paid: money(paid), totalDue, balance, status };
};

const refreshInvoiceStatus = async (tx, schoolId, invoiceId) => {
  const invoice = await tx.feeInvoice.findFirst({
    where: { id: invoiceId, schoolId },
    include: { concessions: { select: { amount: true } }, transactions: { select: { amount: true } } },
  });
  if (!invoice) throw createError("Fee invoice not found.", 404);
  const { status } = getInvoiceTotals(invoice);
  await tx.feeInvoice.update({
    where: { id: invoiceId },
    data: { status, updatedAt: new Date() },
  });
  return status;
};

const getFeeStructures = async (schoolId) => prisma.feeStructure.findMany({
  where: { schoolId },
  orderBy: [{ term: { academicYear: "desc" } }, { class: { level: "asc" } }],
  include: {
    class: { select: { id: true, level: true, section: true, academicYear: true } },
    term: { select: { id: true, termNumber: true, academicYear: true } },
    items: { include: { category: { select: { id: true, name: true } } } },
  },
});

const getFeeOptions = async (schoolId) => {
  const [classes, terms] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId },
      select: { id: true, level: true, section: true, academicYear: true },
      orderBy: [{ academicYear: "desc" }, { level: "asc" }, { section: "asc" }],
    }),
    prisma.term.findMany({
      where: { schoolId },
      select: { id: true, termNumber: true, academicYear: true },
      orderBy: [{ academicYear: "desc" }, { termNumber: "asc" }],
    }),
  ]);
  return { classes, terms };
};

const saveFeeStructure = async (schoolId, data) => {
  const { classId, termId, items } = data;
  if (!Array.isArray(items) || items.length === 0) {
    throw createError("Add at least one fee item.", 422);
  }

  const categoryIds = items.map((item) => item.categoryId);
  if (new Set(categoryIds).size !== categoryIds.length) {
    throw createError("Each financial category can only be listed once.", 422);
  }
  for (const item of items) {
    if (!item.categoryId || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) {
      throw createError("Each fee item needs a category and a positive amount.", 422);
    }
  }

  const [classRecord, term, categories] = await Promise.all([
    prisma.class.findFirst({ where: { id: classId, schoolId } }),
    prisma.term.findFirst({ where: { id: termId, schoolId } }),
    prisma.financialCategory.findMany({
      where: { id: { in: categoryIds }, schoolId, isActive: true },
      select: { id: true },
    }),
  ]);
  if (!classRecord) throw createError("Class not found for this school.", 404);
  if (!term) throw createError("Term not found for this school.", 404);
  if (classRecord.academicYear !== term.academicYear) {
    throw createError("Class and term must belong to the same academic year.", 422);
  }
  if (categories.length !== categoryIds.length) {
    throw createError("One or more selected financial categories are unavailable.", 422);
  }

  return runSerializable(async (tx) => {
    const structure = await tx.feeStructure.upsert({
      where: { schoolId_classId_termId: { schoolId, classId, termId } },
      create: { schoolId, classId, termId },
      update: { updatedAt: new Date() },
    });
    await tx.feeStructureItem.deleteMany({ where: { feeStructureId: structure.id } });
    await tx.feeStructureItem.createMany({
      data: items.map((item) => ({
        id: crypto.randomUUID(),
        feeStructureId: structure.id,
        categoryId: item.categoryId,
        amount: money(item.amount),
      })),
    });
    return tx.feeStructure.findUnique({
      where: { id: structure.id },
      include: {
        class: { select: { id: true, level: true, section: true } },
        term: { select: { id: true, termNumber: true, academicYear: true } },
        items: { include: { category: { select: { id: true, name: true } } } },
      },
    });
  }, "The fee structure changed at the same time. Refresh and try again.");
};

const generateInvoices = async (schoolId, data) => {
  const { classId, termId, dueDate: dueDateValue } = data;
  const dueDate = new Date(dueDateValue);
  if (!Number.isFinite(dueDate.getTime())) throw createError("A valid due date is required.", 422);
  dueDate.setUTCHours(23, 59, 59, 999);

  const [classRecord, term, structure] = await Promise.all([
    prisma.class.findFirst({ where: { id: classId, schoolId } }),
    prisma.term.findFirst({ where: { id: termId, schoolId } }),
    prisma.feeStructure.findFirst({
      where: { schoolId, classId, termId },
      include: { items: { include: { category: { select: { id: true, name: true } } } } },
    }),
  ]);
  if (!classRecord) throw createError("Class not found for this school.", 404);
  if (!term) throw createError("Term not found for this school.", 404);
  if (classRecord.academicYear !== term.academicYear) {
    throw createError("Class and term must belong to the same academic year.", 422);
  }
  if (!structure || structure.items.length === 0) {
    throw createError("Set up the class fee structure before generating invoices.", 422);
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      termId,
      classId,
      class: { schoolId },
      student: { schoolId, status: "ACTIVE" },
    },
    select: { studentId: true },
  });
  const studentIds = [...new Set(enrollments.map((entry) => entry.studentId))];
  if (studentIds.length === 0) throw createError("No active students are enrolled in this class and term.", 422);

  return runSerializable(async (tx) => {
    const existing = await tx.feeInvoice.findMany({
      where: { schoolId, termId, studentId: { in: studentIds } },
      select: { studentId: true },
    });
    const alreadyInvoiced = new Set(existing.map((invoice) => invoice.studentId));
    const createIds = studentIds.filter((studentId) => !alreadyInvoiced.has(studentId));
    const amount = money(structure.items.reduce((sum, item) => sum + amountOf(item.amount), 0));
    const records = createIds.map((studentId) => ({
      id: crypto.randomUUID(),
      schoolId,
      studentId,
      termId,
      invoiceNumber: `FEE-${new Date().getFullYear()}-${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
      amount,
      dueDate,
      status: isPastDue(dueDate) ? "OVERDUE" : "ISSUED",
      updatedAt: new Date(),
    }));

    if (records.length > 0) {
      for (let offset = 0; offset < records.length; offset += 1000) {
        await tx.feeInvoice.createMany({ data: records.slice(offset, offset + 1000) });
      }
      for (let offset = 0; offset < records.length; offset += 100) {
        const batch = records.slice(offset, offset + 100);
        const lineItems = batch.flatMap((invoice) => structure.items.map((item) => ({
          id: crypto.randomUUID(),
          invoiceId: invoice.id,
          categoryId: item.categoryId,
          description: item.category.name,
          amount: item.amount,
        })));
        await tx.feeInvoiceItem.createMany({ data: lineItems });
      }
    }
    return { created: records.length, skipped: alreadyInvoiced.size };
  }, "Invoices were created or updated at the same time. Refresh and try again.");
};

const getInvoices = async (schoolId, query = {}) => {
  const where = { schoolId };
  if (query.termId) where.termId = query.termId;
  if (query.classId) {
    where.student = { enrollments: { some: { termId: query.termId, classId: query.classId } } };
  }
  const invoices = await prisma.feeInvoice.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: includeInvoiceDetails,
  });
  return invoices.map((invoice) => {
    const totals = getInvoiceTotals(invoice);
    const enrollment = invoice.student.enrollments.find((entry) => entry.termId === invoice.termId);
    return {
      ...invoice,
      ...totals,
      student: {
        ...invoice.student,
        class: enrollment?.class || null,
        guardians: invoice.student.guardians.map((item) => item.guardian),
      },
    };
  }).filter((invoice) => !query.status || invoice.status === query.status);
};

const addConcession = async (schoolId, userId, invoiceId, data) => {
  const amount = money(data.amount);
  const reason = String(data.reason || "").trim();
  if (!Number.isFinite(amount) || amount <= 0 || !reason) {
    throw createError("A positive concession amount and reason are required.", 422);
  }

  return runSerializable(async (tx) => {
    const invoice = await tx.feeInvoice.findFirst({
      where: { id: invoiceId, schoolId },
      include: { concessions: { select: { amount: true } }, transactions: { select: { amount: true } } },
    });
    if (!invoice) throw createError("Fee invoice not found.", 404);
    const totals = getInvoiceTotals(invoice);
    if (totals.status === "PAID" || amount > totals.balance) {
      throw createError("The concession cannot exceed the invoice balance.", 422);
    }
    await tx.feeInvoiceConcession.create({
      data: { invoiceId, amount, reason, createdById: userId },
    });
    await refreshInvoiceStatus(tx, schoolId, invoiceId);
    return tx.feeInvoice.findFirst({ where: { id: invoiceId, schoolId }, include: includeInvoiceDetails });
  }, "The invoice balance changed at the same time. Refresh and try again.");
};

const getArrears = async (schoolId, query = {}) => {
  const invoices = await getInvoices(schoolId, {
    ...query,
    status: undefined,
  });
  return invoices.filter((invoice) => invoice.balance > 0 && invoice.status === "OVERDUE").map((invoice) => {
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const dueDate = new Date(invoice.dueDate);
    const dueDateUtc = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
    const daysOverdue = Math.max(1, Math.floor((todayUtc - dueDateUtc) / 86400000));
    const agingBucket = daysOverdue === 0 ? "not_due"
      : daysOverdue <= 30 ? "1_30"
        : daysOverdue <= 60 ? "31_60"
          : daysOverdue <= 90 ? "61_90" : "over_90";
    return { ...invoice, daysOverdue, agingBucket };
  });
};

const sendArrearsReminders = async (schoolId, invoiceIds) => {
  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0 || invoiceIds.length > 100) {
    throw createError("Select between 1 and 100 outstanding invoices.", 422);
  }
  const uniqueInvoiceIds = [...new Set(invoiceIds)];
  const invoices = await prisma.feeInvoice.findMany({
    where: { schoolId, id: { in: uniqueInvoiceIds } },
    include: includeInvoiceDetails,
  });
  if (invoices.length !== uniqueInvoiceIds.length) {
    throw createError("One or more selected invoices were not found for this school.", 404);
  }

  const results = [];
  for (const invoice of invoices) {
    const totals = getInvoiceTotals(invoice);
    if (totals.balance <= 0) {
      results.push({ invoiceNumber: invoice.invoiceNumber, sent: 0, failed: 0, reason: "Invoice is paid." });
      continue;
    }
    if (totals.status !== "OVERDUE") {
      results.push({ invoiceNumber: invoice.invoiceNumber, sent: 0, failed: 0, reason: "Invoice is not overdue." });
      continue;
    }
    const guardians = invoice.student.guardians
      .map((item) => item.guardian)
      .filter((guardian) => guardian.email);
    if (guardians.length === 0) {
      results.push({ invoiceNumber: invoice.invoiceNumber, sent: 0, failed: 0, reason: "No guardian email address." });
      continue;
    }
    let sent = 0;
    let failed = 0;
    for (const guardian of guardians) {
      const greeting = guardian.firstName ? `Dear ${escapeHtml(guardian.firstName)},` : "Dear Parent or Guardian,";
      const studentName = `${escapeHtml(invoice.student.firstName)} ${escapeHtml(invoice.student.lastName)}`;
      const html = `<p>${greeting}</p><p>This is a reminder that a balance of <strong>GHS ${totals.balance.toFixed(2)}</strong> is due for ${studentName}.</p><p>Invoice: ${escapeHtml(invoice.invoiceNumber)}<br>Due date: ${new Date(invoice.dueDate).toLocaleDateString()}</p><p>Please contact the school office if you have already made this payment.</p>`;
      try {
        await sendMail({ to: guardian.email, subject: `Fee payment reminder: ${invoice.invoiceNumber}`, html });
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    results.push({
      invoiceNumber: invoice.invoiceNumber,
      sent,
      failed,
      ...(failed > 0 ? { reason: "One or more emails could not be delivered." } : {}),
    });
  }
  return {
    sent: results.reduce((sum, item) => sum + item.sent, 0),
    failed: results.reduce((sum, item) => sum + item.failed, 0),
    results,
  };
};

module.exports = {
  getFeeStructures,
  getFeeOptions,
  saveFeeStructure,
  generateInvoices,
  getInvoices,
  getArrears,
  addConcession,
  sendArrearsReminders,
  getInvoiceTotals,
  refreshInvoiceStatus,
  runSerializable,
};
