const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { sendSms } = require("./sms.service");
const logger = require("../config/logger");

const notifyGuardiansOfAbsence = async (students, date) => {
  const schoolName = students[0]?.school?.name || "your school";
  const dateText = new Date(date).toISOString().slice(0, 10);
  const message = `Attendance alert from ${schoolName}: Your child was recorded absent on ${dateText}. Please contact the school if this is incorrect.`;
  const notifications = new Map();
  const phoneNumbers = [];

  for (const student of students) {
    for (const { guardian } of student.guardians || []) {
      if (guardian.userId) {
        notifications.set(guardian.userId, {
          userId: guardian.userId,
          title: "Student absence recorded",
          message,
          type: "attendance",
          isRead: false,
        });
      }
      if (guardian.phone) phoneNumbers.push(guardian.phone);
    }
  }

  if (notifications.size) {
    try {
      await prisma.notification.createMany({ data: [...notifications.values()] });
    } catch (error) {
      logger.error(`Unable to create absence notifications: ${error.message}`);
    }
  }

  const sms = await sendSms(phoneNumbers, message);
  if (sms.failed > 0) {
    logger.warn(`Absence SMS delivery: ${sms.accepted} accepted, ${sms.failed} failed.`);
  }
};

const getStudentsForAbsence = async (schoolId, studentIds) => prisma.student.findMany({
  where: { id: { in: studentIds }, schoolId },
  select: {
    id: true,
    school: { select: { name: true } },
    guardians: {
      where: { guardian: { schoolId } },
      select: {
        guardian: { select: { userId: true, phone: true } },
      },
    },
  },
});

const validateAttendanceScope = async (schoolId, classId, termId, studentIds) => {
  const [schoolClass, schoolTerm, enrollments] = await Promise.all([
    prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } }),
    prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true } }),
    prisma.enrollment.findMany({
      where: { classId, termId, studentId: { in: studentIds } },
      select: { studentId: true },
    }),
  ]);
  if (!schoolClass || !schoolTerm) throw createError("Class or term not found in this school.", 404);
  if (new Set(enrollments.map((enrollment) => enrollment.studentId)).size !== studentIds.length) {
    throw createError("Every student must be enrolled in the selected class and term.", 400);
  }
};

const markAttendance = async (schoolId, data) => {
  const { studentId, classId, termId, date, status, note } = data;

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true,
      school: { select: { name: true } },
      guardians: {
        where: { guardian: { schoolId } },
        select: { guardian: { select: { userId: true, phone: true } } },
      },
    },
  });
  if (!student) throw createError("Student not found.", 404);
  await validateAttendanceScope(schoolId, classId, termId, [studentId]);

  const attendanceDate = new Date(date);
  const key = { studentId_date: { studentId, date: attendanceDate } };
  const existing = await prisma.attendance.findUnique({ where: key, select: { status: true } });
  const attendance = await prisma.attendance.upsert({
    where: key,
    create: { studentId, classId, termId, date: new Date(date), status, note: note || null },
    update: { status, note: note || null },
  });

  if (status === "ABSENT" && existing?.status !== "ABSENT") {
    await notifyGuardiansOfAbsence([student], attendanceDate);
  }
  return attendance;
};

const bulkMarkAttendance = async (schoolId, { classId, termId, date, records }) => {
  const studentIds = [...new Set(records.map((record) => record.studentId))];
  const students = await getStudentsForAbsence(schoolId, studentIds);
  if (students.length !== studentIds.length) throw createError("One or more students were not found in this school.", 404);
  await validateAttendanceScope(schoolId, classId, termId, studentIds);

  const attendanceDate = new Date(date);
  const existingAttendance = await prisma.attendance.findMany({
    where: { studentId: { in: studentIds }, date: attendanceDate },
    select: { studentId: true, status: true },
  });
  const existingStatus = new Map(existingAttendance.map((record) => [record.studentId, record.status]));
  let marked = 0;
  for (const r of records) {
    await prisma.attendance.upsert({
      where:  { studentId_date: { studentId: r.studentId, date: attendanceDate } },
      create: { studentId: r.studentId, classId, termId, date: attendanceDate, status: r.status, note: r.note || null },
      update: { status: r.status, note: r.note || null },
    });
    marked++;
  }

  const finalStatus = new Map(records.map((record) => [record.studentId, record.status]));
  const newlyAbsent = students.filter((student) =>
    finalStatus.get(student.id) === "ABSENT" && existingStatus.get(student.id) !== "ABSENT"
  );
  if (newlyAbsent.length) await notifyGuardiansOfAbsence(newlyAbsent, attendanceDate);
  return { marked };
};

const getAttendance = async (schoolId, query = {}) => {
  const where = { student: { schoolId } };

  if (query.classId)   where.classId   = query.classId;
  if (query.studentId) where.studentId = query.studentId;
  if (query.termId)    where.termId    = query.termId;

  const dateFilter = {};
  if (query.date) {
    const selectedDate = new Date(query.date);
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    dateFilter.gte = start;
    dateFilter.lte = end;
  }

  if (query.from || query.to) {
    if (query.from) dateFilter.gte = new Date(query.from);
    if (query.to)   dateFilter.lte = new Date(query.to);
  }

  if (Object.keys(dateFilter).length > 0) where.date = dateFilter;

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
  const updated = await prisma.attendance.update({ where: { id: attendanceId }, data });
  if (data.status === "ABSENT" && record.status !== "ABSENT") {
    const students = await getStudentsForAbsence(schoolId, [record.studentId]);
    if (students.length) await notifyGuardiansOfAbsence(students, updated.date);
  }
  return updated;
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
