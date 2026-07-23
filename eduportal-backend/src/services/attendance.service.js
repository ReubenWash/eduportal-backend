const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");

const markAttendance = async (schoolId, data) => {
  const { studentId, classId, termId, date, status, note } = data;

  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw createError("Student not found.", 404);

  return prisma.attendance.upsert({
    where:  { studentId_date: { studentId, date: new Date(date) } },
    create: { studentId, classId, termId, date: new Date(date), status, note: note || null },
    update: { status, note: note || null },
  });
};

const bulkMarkAttendance = async (schoolId, { classId, termId, date, records }) => {
  let marked = 0;
  for (const r of records) {
    await prisma.attendance.upsert({
      where:  { studentId_date: { studentId: r.studentId, date: new Date(date) } },
      create: { studentId: r.studentId, classId, termId, date: new Date(date), status: r.status, note: r.note || null },
      update: { status: r.status, note: r.note || null },
    });
    marked++;
  }
  return { marked };
};

const getAttendance = async (schoolId, query) => {
  const where = { student: { schoolId } };
  if (query.classId)   where.classId   = query.classId;
  if (query.studentId) where.studentId = query.studentId;
  if (query.from || query.to) {
    where.date = {};
    if (query.from) where.date.gte = new Date(query.from);
    if (query.to)   where.date.lte = new Date(query.to);
  }

  return prisma.attendance.findMany({
    where,
    orderBy: { date: "desc" },
    include: { student: { select: { firstName: true, lastName: true, studentNumber: true } } },
  });
};

const updateAttendance = async (schoolId, attendanceId, data) => {
  const record = await prisma.attendance.findFirst({
    where: { id: attendanceId, student: { schoolId } },
  });
  if (!record) throw createError("Attendance record not found.", 404);

  return prisma.attendance.update({ where: { id: attendanceId }, data });
};

const getAttendanceSummary = async (schoolId, classId, termId) => {
  const enrollments = await prisma.enrollment.findMany({
    where:   { classId, termId, student: { schoolId } },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
  });

  const term = await prisma.term.findFirst({ where: { id: termId } });
  const totalDays = term
    ? Math.ceil((new Date(term.endDate) - new Date(term.startDate)) / (1000 * 60 * 60 * 24 * 7)) * 5
    : 0;

  const summary = await Promise.all(
    enrollments.map(async (e) => {
      const records = await prisma.attendance.findMany({
        where: { studentId: e.studentId, termId },
      });
      const present = records.filter((r) => r.status === "PRESENT").length;
      const absent  = records.filter((r) => r.status === "ABSENT").length;
      const late    = records.filter((r) => r.status === "LATE").length;
      const excused = records.filter((r) => r.status === "EXCUSED").length;

      return { studentId: e.studentId, student: e.student, present, absent, late, excused, totalDays };
    })
  );

  return summary;
};

const getAttendanceAnalytics = async (schoolId, termId, classId) => {
  const whereBase = { student: { schoolId }, termId };
  if (classId) whereBase.classId = classId;

  const allRecords = await prisma.attendance.findMany({
    where: whereBase,
    select: { date: true, status: true, classId: true },
  });

  // Class averages
  const byClass = {};
  allRecords.forEach((r) => {
    if (!byClass[r.classId]) byClass[r.classId] = { total: 0, present: 0 };
    byClass[r.classId].total++;
    if (r.status === "PRESENT") byClass[r.classId].present++;
  });

  const classAverages = Object.entries(byClass).map(([cId, d]) => ({
    classId:     cId,
    attendanceRate: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0,
  }));

  return { classAverages, totalRecords: allRecords.length };
};

module.exports = {
  markAttendance,
  bulkMarkAttendance,
  getAttendance,
  updateAttendance,
  getAttendanceSummary,
  getAttendanceAnalytics,
};
