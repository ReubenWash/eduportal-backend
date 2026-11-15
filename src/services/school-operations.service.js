const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

const cleanOptional = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || null;
};

const listBooks = (schoolId, search = "") => {
  const where = { schoolId };
  if (search.trim()) {
    where.OR = [
      { title: { contains: search.trim(), mode: "insensitive" } },
      { author: { contains: search.trim(), mode: "insensitive" } },
      { isbn: { contains: search.trim(), mode: "insensitive" } },
    ];
  }
  return prisma.libraryBook.findMany({ where, orderBy: { title: "asc" } });
};

const createBook = (schoolId, data) => prisma.libraryBook.create({
  data: {
    schoolId,
    title: data.title.trim(),
    author: cleanOptional(data.author),
    category: cleanOptional(data.category),
    isbn: cleanOptional(data.isbn),
    totalCopies: Number(data.totalCopies),
    availableCopies: Number(data.totalCopies),
  },
});

const updateBook = async (schoolId, id, data) => {
  const book = await prisma.libraryBook.findFirst({ where: { id, schoolId } });
  if (!book) throw createError("Book not found.", 404);
  const totalCopies = data.totalCopies === undefined ? book.totalCopies : Number(data.totalCopies);
  if (totalCopies < book.totalCopies - book.availableCopies) {
    throw createError("Total copies cannot be lower than the number of copies already borrowed.", 400);
  }

  return prisma.libraryBook.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.author !== undefined && { author: cleanOptional(data.author) }),
      ...(data.category !== undefined && { category: cleanOptional(data.category) }),
      ...(data.isbn !== undefined && { isbn: cleanOptional(data.isbn) }),
      ...(data.totalCopies !== undefined && {
        totalCopies,
        availableCopies: totalCopies - (book.totalCopies - book.availableCopies),
      }),
    },
  });
};

const deleteBook = async (schoolId, id) => {
  const result = await prisma.libraryBook.deleteMany({ where: { id, schoolId } });
  if (!result.count) throw createError("Book not found.", 404);
};

const listTransportRoutes = (schoolId, search = "") => {
  const where = { schoolId };
  if (search.trim()) {
    where.OR = [
      { name: { contains: search.trim(), mode: "insensitive" } },
      { vehiclePlate: { contains: search.trim(), mode: "insensitive" } },
      { driverName: { contains: search.trim(), mode: "insensitive" } },
    ];
  }
  return prisma.transportRoute.findMany({ where, orderBy: { name: "asc" } });
};

const createTransportRoute = (schoolId, data) => prisma.transportRoute.create({
  data: {
    schoolId,
    name: data.name.trim(),
    vehiclePlate: cleanOptional(data.vehiclePlate),
    driverName: cleanOptional(data.driverName),
    driverPhone: cleanOptional(data.driverPhone),
    stopCount: Number(data.stopCount || 0),
    capacity: Number(data.capacity || 0),
    status: data.status || "ACTIVE",
  },
});

const updateTransportRoute = async (schoolId, id, data) => {
  const route = await prisma.transportRoute.findFirst({ where: { id, schoolId } });
  if (!route) throw createError("Transport route not found.", 404);
  return prisma.transportRoute.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.vehiclePlate !== undefined && { vehiclePlate: cleanOptional(data.vehiclePlate) }),
      ...(data.driverName !== undefined && { driverName: cleanOptional(data.driverName) }),
      ...(data.driverPhone !== undefined && { driverPhone: cleanOptional(data.driverPhone) }),
      ...(data.stopCount !== undefined && { stopCount: Number(data.stopCount) }),
      ...(data.capacity !== undefined && { capacity: Number(data.capacity) }),
      ...(data.status !== undefined && { status: data.status }),
    },
  });
};

const listPayroll = async (schoolId, period) => {
  const where = { schoolId, ...(period && { period }) };
  const entries = await prisma.payrollEntry.findMany({
    where,
    include: {
      staff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          user: { select: { email: true, role: true, isActive: true } },
        },
      },
    },
    orderBy: [{ period: "desc" }, { createdAt: "desc" }],
  });

  const summaryCents = entries.reduce((totals, entry) => {
    const netPay = Math.round(Number(entry.netPay) * 100);
    totals.gross += Math.round((Number(entry.basicSalary) + Number(entry.allowances)) * 100);
    totals.paid += entry.status === "PAID" ? netPay : 0;
    totals.pending += entry.status === "PENDING" ? netPay : 0;
    return totals;
  }, { gross: 0, paid: 0, pending: 0 });

  return {
    entries,
    summary: {
      gross: summaryCents.gross / 100,
      paid: summaryCents.paid / 100,
      pending: summaryCents.pending / 100,
      staffCount: new Set(entries.map((entry) => entry.staffId)).size,
    },
  };
};

const listPayrollStaff = (schoolId) => prisma.staff.findMany({
  where: { schoolId, user: { isActive: true } },
  select: {
    id: true,
    firstName: true,
    lastName: true,
    user: { select: { role: true, email: true } },
  },
  orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
});

const createPayrollEntry = async (schoolId, data) => {
  const staff = await prisma.staff.findFirst({
    where: { id: data.staffId, schoolId, user: { isActive: true } },
    select: { id: true },
  });
  if (!staff) throw createError("Active staff member not found in this school.", 404);

  const basicSalaryCents = Math.round(Number(data.basicSalary) * 100);
  const allowancesCents = Math.round(Number(data.allowances || 0) * 100);
  const deductionsCents = Math.round(Number(data.deductions || 0) * 100);
  const grossPayCents = basicSalaryCents + allowancesCents;
  if (deductionsCents > grossPayCents) throw createError("Deductions cannot exceed gross pay.", 400);

  return prisma.payrollEntry.create({
    data: {
      schoolId,
      staffId: staff.id,
      period: data.period,
      basicSalary: basicSalaryCents / 100,
      allowances: allowancesCents / 100,
      deductions: deductionsCents / 100,
      netPay: (grossPayCents - deductionsCents) / 100,
    },
  });
};

const markPayrollPaid = async (schoolId, id) => {
  const entry = await prisma.payrollEntry.findFirst({ where: { id, schoolId } });
  if (!entry) throw createError("Payroll entry not found.", 404);
  if (entry.status === "PAID") return entry;
  return prisma.payrollEntry.update({
    where: { id },
    data: { status: "PAID", paidAt: new Date() },
  });
};

const listAnnouncements = (schoolId) => prisma.announcement.findMany({
  where: { schoolId },
  orderBy: { createdAt: "desc" },
  take: 100,
});

const exportSchoolData = async (schoolId) => {
  const [
    school, students, staff, classes, subjects, terms, attendance,
    feeInvoices, financialTransactions, expenses, libraryBooks, transportRoutes, payrollEntries,
  ] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, slug: true, region: true, district: true, address: true, phone: true, email: true, type: true },
    }),
    prisma.student.findMany({
      where: { schoolId },
      select: {
        id: true, studentNumber: true, firstName: true, lastName: true, otherNames: true,
        gender: true, dateOfBirth: true, status: true, admissionDate: true,
        guardians: { select: { isPrimary: true, guardian: { select: { firstName: true, lastName: true, phone: true, email: true, relationship: true } } } },
        enrollments: { select: { class: { select: { level: true, section: true, academicYear: true } }, term: { select: { termNumber: true, academicYear: true } } } },
      },
      orderBy: { admissionDate: "desc" },
    }),
    prisma.staff.findMany({
      where: { schoolId },
      select: {
        id: true, firstName: true, lastName: true, phone: true, gender: true, qualification: true, staffNumber: true,
        user: { select: { email: true, role: true, isActive: true } },
      },
      orderBy: { lastName: "asc" },
    }),
    prisma.class.findMany({ where: { schoolId }, include: { enrollments: { select: { studentId: true, termId: true } } } }),
    prisma.subject.findMany({ where: { schoolId } }),
    prisma.term.findMany({ where: { schoolId }, orderBy: { startDate: "desc" } }),
    prisma.attendance.findMany({ where: { student: { schoolId } }, orderBy: { date: "desc" } }),
    prisma.feeInvoice.findMany({ where: { schoolId }, include: { student: { select: { studentNumber: true, firstName: true, lastName: true } } } }),
    prisma.financialTransaction.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } }),
    prisma.expense.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" } }),
    prisma.libraryBook.findMany({ where: { schoolId } }),
    prisma.transportRoute.findMany({ where: { schoolId } }),
    prisma.payrollEntry.findMany({ where: { schoolId }, orderBy: { period: "desc" } }),
  ]);
  if (!school) throw createError("School not found.", 404);
  return {
    exportedAt: new Date().toISOString(),
    school,
    data: { students, staff, classes, subjects, terms, attendance, feeInvoices, financialTransactions, expenses, libraryBooks, transportRoutes, payrollEntries },
  };
};

module.exports = {
  listBooks,
  createBook,
  updateBook,
  deleteBook,
  listTransportRoutes,
  createTransportRoute,
  updateTransportRoute,
  listPayroll,
  listPayrollStaff,
  createPayrollEntry,
  markPayrollPaid,
  listAnnouncements,
  exportSchoolData,
};
