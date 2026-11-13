const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const assignmentInclude = {
  class: { select: { id: true, level: true, section: true } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  term: { select: { id: true, academicYear: true, termNumber: true } },
};

const getStaffId = async (user) => {
  const staff = await prisma.staff.findFirst({
    where: { userId: user.userId, schoolId: user.schoolId },
    select: { id: true },
  });
  if (!staff) throw createError("Staff profile not found.", 404);
  return staff.id;
};

const assertOwnChild = async (user, studentId) => {
  const link = await prisma.studentGuardian.findFirst({
    where: {
      studentId,
      guardian: { userId: user.userId, schoolId: user.schoolId },
      student: { schoolId: user.schoolId },
    },
    select: { studentId: true },
  });
  if (!link) throw createError("You are not linked to this student.", 403);
};

const getStudentEnrollment = async (studentId, schoolId) => {
  const where = { studentId, class: { schoolId }, term: { schoolId } };
  const include = {
    class: {
      include: {
        classTeacher: {
          select: { firstName: true, lastName: true, phone: true, user: { select: { email: true } } },
        },
      },
    },
    term: { select: { id: true, academicYear: true, termNumber: true } },
  };
  const activeEnrollment = await prisma.enrollment.findFirst({
    where: { ...where, term: { schoolId, status: "ACTIVE" } },
    orderBy: { createdAt: "desc" },
    include,
  });
  if (activeEnrollment) return activeEnrollment;
  return prisma.enrollment.findFirst({
    where,
    orderBy: [{ term: { startDate: "desc" } }, { createdAt: "desc" }],
    include,
  });
};

const assertTeacherClassAccess = async (user, classId, subjectId = null) => {
  const classRecord = await prisma.class.findFirst({
    where: { id: classId, schoolId: user.schoolId },
    select: { id: true, classTeacherId: true },
  });
  if (!classRecord) throw createError("Class not found.", 404);
  if (user.role === "SCHOOL_ADMIN" || user.role === "SUPER_ADMIN") return { staffId: null, classRecord };
  const staffId = await getStaffId(user);

  if (user.role === "CLASS_TEACHER" && classRecord.classTeacherId === staffId) {
    return { staffId, classRecord };
  }
  const assignment = await prisma.staffSubject.findFirst({
    where: {
      staffId,
      classId,
      ...(subjectId ? { subjectId } : {}),
    },
    select: { id: true },
  });
  if (!assignment) throw createError("You do not have access to this class or subject.", 403);
  return { staffId, classRecord };
};

const getChildTimetable = async (user, studentId) => {
  await assertOwnChild(user, studentId);
  const enrollment = await getStudentEnrollment(studentId, user.schoolId);
  if (!enrollment) return { className: null, schedule: [] };
  const slots = await prisma.timetableSlot.findMany({
    where: { schoolId: user.schoolId, classId: enrollment.classId, termId: enrollment.termId },
    include: {
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  const schedule = DAY_ORDER
    .map((day) => ({
      day: `${day[0]}${day.slice(1).toLowerCase()}`,
      periods: slots.filter((slot) => slot.weekday === day).map((slot) => ({
        id: slot.id,
        time: `${slot.startTime} - ${slot.endTime}`,
        subject: slot.subject?.name || "Lesson",
        teacher: slot.teacher ? `${slot.teacher.firstName} ${slot.teacher.lastName}` : null,
        room: slot.room,
      })),
    }))
    .filter((entry) => entry.periods.length > 0);
  return {
    className: `${enrollment.class.level} ${enrollment.class.section}`.trim(),
    term: enrollment.term,
    schedule,
  };
};

const getClassTimetable = async (user, classId, termId) => {
  const classRecord = await prisma.class.findFirst({
    where: { id: classId, schoolId: user.schoolId },
    select: { id: true, level: true, section: true },
  });
  if (!classRecord) throw createError("Class not found.", 404);
  let slotFilter = {};
  if (["CLASS_TEACHER", "SUBJECT_TEACHER"].includes(user.role)) {
    await assertTeacherClassAccess(user, classId);
    if (user.role === "SUBJECT_TEACHER") {
      const staffId = await getStaffId(user);
      const assignments = await prisma.staffSubject.findMany({
        where: { staffId, classId },
        select: { subjectId: true },
      });
      slotFilter = {
        OR: [
          { teacher: { userId: user.userId } },
          { subjectId: { in: assignments.map((assignment) => assignment.subjectId) } },
        ],
      };
    }
  }
  const term = termId
    ? await prisma.term.findFirst({ where: { id: termId, schoolId: user.schoolId } })
    : await prisma.term.findFirst({
      where: { schoolId: user.schoolId, status: "ACTIVE" },
      orderBy: { startDate: "desc" },
    });
  if (!term) throw createError("No matching academic term was found.", 404);
  const slots = await prisma.timetableSlot.findMany({
    where: { schoolId: user.schoolId, classId, termId: term.id, ...slotFilter },
    include: {
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  return {
    className: `${classRecord.level} ${classRecord.section}`.trim(),
    term,
    schedule: DAY_ORDER.map((day) => ({
      day: `${day[0]}${day.slice(1).toLowerCase()}`,
      periods: slots.filter((slot) => slot.weekday === day).map((slot) => ({
        id: slot.id,
        time: `${slot.startTime} - ${slot.endTime}`,
        subject: slot.subject?.name || "Lesson",
        teacher: slot.teacher ? `${slot.teacher.firstName} ${slot.teacher.lastName}` : null,
        room: slot.room,
      })),
    })).filter((entry) => entry.periods.length > 0),
  };
};

const getTeacherTimetable = async (user, termId) => {
  const staffId = await getStaffId(user);
  const term = termId
    ? await prisma.term.findFirst({ where: { id: termId, schoolId: user.schoolId } })
    : await prisma.term.findFirst({
      where: { schoolId: user.schoolId, status: "ACTIVE" },
      orderBy: { startDate: "desc" },
    });
  if (!term) throw createError("No matching academic term was found.", 404);
  const slots = await prisma.timetableSlot.findMany({
    where: { schoolId: user.schoolId, teacherId: staffId, termId: term.id },
    include: {
      class: { select: { level: true, section: true } },
      subject: { select: { name: true } },
    },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  return { term, slots };
};

const timeToMinutes = (time) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || "");
  if (!match) throw createError("Times must use 24-hour HH:MM format.", 400);
  return Number(match[1]) * 60 + Number(match[2]);
};

const saveTimetableSlot = async (user, data) => {
  const { staffId } = await assertTeacherClassAccess(user, data.classId, data.subjectId || null);
  const classRecord = await prisma.class.findFirst({ where: { id: data.classId, schoolId: user.schoolId } });
  const term = await prisma.term.findFirst({ where: { id: data.termId, schoolId: user.schoolId } });
  if (!classRecord || !term) throw createError("Class or term not found in this school.", 404);
  if (data.subjectId) {
    const subject = await prisma.classSubject.findFirst({
      where: { classId: data.classId, subjectId: data.subjectId, subject: { schoolId: user.schoolId } },
      select: { subjectId: true },
    });
    if (!subject) throw createError("Subject is not assigned to this class.", 400);
  }
  const teacherId = data.teacherId || staffId;
  const teacher = await prisma.staff.findFirst({ where: { id: teacherId, schoolId: user.schoolId }, select: { id: true } });
  if (!teacher) throw createError("Teacher not found in this school.", 404);
  const start = timeToMinutes(data.startTime);
  const end = timeToMinutes(data.endTime);
  if (start >= end) throw createError("End time must be after start time.", 400);

  const existing = await prisma.timetableSlot.findMany({
    where: {
      schoolId: user.schoolId,
      termId: data.termId,
      weekday: data.weekday,
      ...(data.id ? { id: { not: data.id } } : {}),
      OR: [{ classId: data.classId }, { teacherId }],
    },
    select: { classId: true, teacherId: true, startTime: true, endTime: true },
  });
  const conflict = existing.some((slot) => {
    const overlaps = start < timeToMinutes(slot.endTime) && end > timeToMinutes(slot.startTime);
    return overlaps && (slot.classId === data.classId || slot.teacherId === teacherId);
  });
  if (conflict) throw createError("This class or teacher already has a timetable slot during that time.", 409);

  const slotData = {
    schoolId: user.schoolId,
    classId: data.classId,
    termId: data.termId,
    subjectId: data.subjectId || null,
    teacherId,
    weekday: data.weekday,
    startTime: data.startTime,
    endTime: data.endTime,
    room: data.room?.trim() || null,
  };
  if (data.id) {
    const existingSlot = await prisma.timetableSlot.findFirst({ where: { id: data.id, schoolId: user.schoolId } });
    if (!existingSlot) throw createError("Timetable slot not found.", 404);
    return prisma.timetableSlot.update({ where: { id: data.id }, data: slotData });
  }
  return prisma.timetableSlot.create({ data: slotData });
};

const buildAssignmentWhere = async (user, filters = {}) => {
  const where = {
    schoolId: user.schoolId,
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  if (user.role === "STUDENT") {
    const student = await prisma.student.findFirst({ where: { userId: user.userId, schoolId: user.schoolId } });
    if (!student) throw createError("Student profile not found.", 404);
    const enrollment = await getStudentEnrollment(student.id, user.schoolId);
    where.classId = enrollment?.classId || "__no_current_enrollment__";
    where.termId = enrollment?.termId || "__no_current_enrollment__";
    return { where, studentId: student.id };
  }
  if (user.role === "PARENT") {
    if (!filters.studentId) throw createError("studentId is required for parent assignment requests.", 400);
    await assertOwnChild(user, filters.studentId);
    const enrollment = await getStudentEnrollment(filters.studentId, user.schoolId);
    where.classId = enrollment?.classId || "__no_current_enrollment__";
    where.termId = enrollment?.termId || "__no_current_enrollment__";
    return { where, studentId: filters.studentId };
  }
  if (["CLASS_TEACHER", "SUBJECT_TEACHER"].includes(user.role)) {
    const staffId = await getStaffId(user);
    const assignments = await prisma.staffSubject.findMany({ where: { staffId }, select: { classId: true, subjectId: true } });
    const classIds = await prisma.class.findMany({ where: { schoolId: user.schoolId, classTeacherId: staffId }, select: { id: true } });
    const allowedClassIds = [...new Set([...assignments.map((item) => item.classId), ...classIds.map((item) => item.id)])];
    if (filters.classId && !allowedClassIds.includes(filters.classId)) {
      throw createError("You do not have access to this class.", 403);
    }
    if (!filters.classId && allowedClassIds.length === 0) return { where: { id: "__no_accessible_assignments__" } };
    where.classId = filters.classId || { in: allowedClassIds };
    where.OR = [
      { teacherId: staffId },
      { class: { classTeacherId: staffId } },
      ...assignments.map(({ classId, subjectId }) => ({ classId, subjectId })),
    ];
  }
  return { where, studentId: null };
};

const listAssignments = async (user, filters) => {
  const { where, studentId } = await buildAssignmentWhere(user, filters);
  const records = await prisma.assignment.findMany({
    where,
    include: {
      ...assignmentInclude,
      ...(studentId ? { submissions: { where: { studentId }, select: { id: true, status: true, score: true, feedback: true } } } : {}),
      _count: { select: { submissions: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  return records.map((record) => ({
    ...record,
    className: `${record.class.level} ${record.class.section}`.trim(),
    subjectName: record.subject?.name || null,
    teacherName: record.teacher ? `${record.teacher.firstName} ${record.teacher.lastName}` : null,
    submissionsCount: record._count.submissions,
    studentSubmission: record.submissions?.[0] || null,
  }));
};

const createAssignment = async (user, data) => {
  const { staffId } = await assertTeacherClassAccess(user, data.classId, data.subjectId || null);
  const [classRecord, term] = await Promise.all([
    prisma.class.findFirst({ where: { id: data.classId, schoolId: user.schoolId }, select: { id: true } }),
    prisma.term.findFirst({ where: { id: data.termId, schoolId: user.schoolId }, select: { id: true } }),
  ]);
  if (!classRecord || !term) throw createError("Class or term not found in this school.", 404);
  if (data.subjectId) {
    const subject = await prisma.classSubject.findFirst({
      where: { classId: data.classId, subjectId: data.subjectId, subject: { schoolId: user.schoolId } },
      select: { subjectId: true },
    });
    if (!subject) throw createError("Subject is not assigned to this class.", 400);
  }
  return prisma.assignment.create({
    data: {
      schoolId: user.schoolId,
      classId: data.classId,
      termId: data.termId,
      subjectId: data.subjectId || null,
      teacherId: user.role === "SCHOOL_ADMIN" || user.role === "SUPER_ADMIN" ? data.teacherId || staffId : staffId,
      title: data.title.trim(),
      details: data.details?.trim() || null,
      attachmentUrl: data.attachmentUrl || null,
      dueDate: new Date(data.dueDate),
    },
    include: assignmentInclude,
  });
};

const getAssignmentForStaff = async (user, assignmentId) => {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, schoolId: user.schoolId },
    include: {
      ...assignmentInclude,
      class: { select: { id: true, level: true, section: true, classTeacherId: true } },
    },
  });
  if (!assignment) throw createError("Assignment not found.", 404);
  if (["CLASS_TEACHER", "SUBJECT_TEACHER"].includes(user.role)) {
    await assertTeacherClassAccess(user, assignment.classId, assignment.subjectId);
    const staffId = await getStaffId(user);
    if (assignment.teacherId !== staffId && assignment.class.classTeacherId !== staffId) {
      const linked = await prisma.staffSubject.findFirst({
        where: { staffId, classId: assignment.classId, ...(assignment.subjectId ? { subjectId: assignment.subjectId } : {}) },
        select: { id: true },
      });
      if (!linked) throw createError("You do not have access to this assignment.", 403);
    }
  }
  return assignment;
};

const getAssignmentSubmissions = async (user, assignmentId) => {
  await getAssignmentForStaff(user, assignmentId);
  return prisma.assignmentSubmission.findMany({
    where: { assignmentId, assignment: { schoolId: user.schoolId } },
    include: { student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } } },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
  });
};

const submitAssignment = async (user, assignmentId, data) => {
  const student = await prisma.student.findFirst({ where: { userId: user.userId, schoolId: user.schoolId } });
  if (!student) throw createError("Student profile not found.", 404);
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, schoolId: user.schoolId, status: "ACTIVE" },
  });
  if (!assignment) throw createError("Active assignment not found.", 404);
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: student.id, classId: assignment.classId, termId: assignment.termId },
    select: { id: true },
  });
  if (!enrollment) throw createError("You are not enrolled in this assignment's class.", 403);
  if (assignment.dueDate < new Date()) throw createError("This assignment is past its due date.", 400);
  return prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
    create: {
      assignmentId,
      studentId: student.id,
      answerUrl: data.answerUrl || null,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
    update: {
      answerUrl: data.answerUrl || null,
      status: "SUBMITTED",
      submittedAt: new Date(),
      score: null,
      feedback: null,
      gradedAt: null,
      gradedById: null,
    },
  });
};

const gradeSubmission = async (user, submissionId, data) => {
  const submission = await prisma.assignmentSubmission.findFirst({
    where: { id: submissionId, assignment: { schoolId: user.schoolId } },
    include: { assignment: true },
  });
  if (!submission) throw createError("Assignment submission not found.", 404);
  await getAssignmentForStaff(user, submission.assignmentId);
  if (typeof data.score !== "number" || data.score < 0 || data.score > 100) {
    throw createError("Score must be between 0 and 100.", 400);
  }
  return prisma.assignmentSubmission.update({
    where: { id: submissionId },
    data: {
      score: data.score,
      feedback: data.feedback?.trim() || null,
      status: "GRADED",
      gradedAt: new Date(),
      gradedById: user.userId,
    },
  });
};

const getChildAssignments = async (user, studentId) => {
  await assertOwnChild(user, studentId);
  const { where, studentId: scopedStudentId } = await buildAssignmentWhere(user, { studentId });
  const assignments = await prisma.assignment.findMany({
    where,
    include: {
      ...assignmentInclude,
      submissions: { where: { studentId: scopedStudentId }, select: { status: true, score: true, feedback: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  return assignments.map((item) => ({
    id: item.id,
    subject: item.subject?.name || "General",
    title: item.title,
    details: item.details,
    dueDate: item.dueDate,
    status: item.submissions[0]?.status || "PENDING",
    score: item.submissions[0]?.score ?? null,
    feedback: item.submissions[0]?.feedback ?? null,
  }));
};

const getChildTeacherContact = async (user, studentId) => {
  await assertOwnChild(user, studentId);
  const enrollment = await getStudentEnrollment(studentId, user.schoolId);
  const teacher = enrollment?.class?.classTeacher;
  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { phone: true },
  });
  return {
    classTeacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : null,
    classTeacherEmail: teacher?.user?.email || null,
    classTeacherPhone: teacher?.phone || null,
    schoolPhone: school?.phone || null,
  };
};

const getChildConductLog = async (user, studentId) => {
  await assertOwnChild(user, studentId);
  const incidents = await prisma.conductIncident.findMany({
    where: { schoolId: user.schoolId, studentId },
    select: { id: true, type: true, title: true, note: true, occurredAt: true },
    orderBy: { occurredAt: "desc" },
  });
  return incidents.map(({ occurredAt, ...incident }) => ({ ...incident, date: occurredAt }));
};

const listConductIncidents = async (user, filters) => {
  let classFilter = {};
  if (["CLASS_TEACHER", "SUBJECT_TEACHER"].includes(user.role)) {
    const staffId = await getStaffId(user);
    const [homerooms, subjectClasses] = await Promise.all([
      prisma.class.findMany({ where: { schoolId: user.schoolId, classTeacherId: staffId }, select: { id: true } }),
      prisma.staffSubject.findMany({ where: { staffId }, select: { classId: true } }),
    ]);
    const classIds = [...new Set([...homerooms.map((record) => record.id), ...subjectClasses.map((record) => record.classId)])];
    if (filters.classId && !classIds.includes(filters.classId)) {
      throw createError("You do not have access to this class.", 403);
    }
    if (!filters.classId && classIds.length === 0) return [];
    classFilter = { classId: filters.classId || { in: classIds } };
  }
  return prisma.conductIncident.findMany({
    where: {
      schoolId: user.schoolId,
      ...classFilter,
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
      class: { select: { level: true, section: true } },
      reporter: { select: { firstName: true, lastName: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });
};

const createConductIncident = async (user, data) => {
  const student = await prisma.student.findFirst({ where: { id: data.studentId, schoolId: user.schoolId }, select: { id: true } });
  if (!student) throw createError("Student not found in this school.", 404);
  if (data.termId) {
    const term = await prisma.term.findFirst({ where: { id: data.termId, schoolId: user.schoolId }, select: { id: true } });
    if (!term) throw createError("Term not found in this school.", 404);
  }
  if (data.classId) {
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: student.id, classId: data.classId, ...(data.termId ? { termId: data.termId } : {}), class: { schoolId: user.schoolId } },
      select: { id: true },
    });
    if (!enrollment) throw createError("Student is not enrolled in this class.", 400);
    if (["CLASS_TEACHER", "SUBJECT_TEACHER"].includes(user.role)) {
      await assertTeacherClassAccess(user, data.classId);
    }
  } else if (["CLASS_TEACHER", "SUBJECT_TEACHER"].includes(user.role)) {
    throw createError("A class is required when a teacher records an incident.", 400);
  }
  const staff = user.role === "SCHOOL_ADMIN" || user.role === "SUPER_ADMIN" ? null : await getStaffId(user);
  return prisma.conductIncident.create({
    data: {
      schoolId: user.schoolId,
      studentId: student.id,
      classId: data.classId || null,
      termId: data.termId || null,
      reporterId: staff,
      type: data.type,
      title: data.title.trim(),
      note: data.note?.trim() || null,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
    },
  });
};

const updateConductIncident = async (user, incidentId, data) => {
  const incident = await prisma.conductIncident.findFirst({ where: { id: incidentId, schoolId: user.schoolId } });
  if (!incident) throw createError("Conduct record not found.", 404);
  if (["CLASS_TEACHER", "SUBJECT_TEACHER"].includes(user.role)) {
    if (!incident.classId) throw createError("You do not have access to this record.", 403);
    await assertTeacherClassAccess(user, incident.classId);
  }
  return prisma.conductIncident.update({
    where: { id: incident.id },
    data: {
      ...(data.actionTaken !== undefined ? { actionTaken: data.actionTaken.trim() || null } : {}),
      ...(data.resolved !== undefined ? { resolvedAt: data.resolved ? new Date() : null } : {}),
    },
  });
};

module.exports = {
  getStudentEnrollment,
  assertOwnChild,
  getChildTimetable,
  getClassTimetable,
  getTeacherTimetable,
  saveTimetableSlot,
  listAssignments,
  createAssignment,
  getAssignmentSubmissions,
  submitAssignment,
  gradeSubmission,
  getChildAssignments,
  getChildTeacherContact,
  getChildConductLog,
  listConductIncidents,
  createConductIncident,
  updateConductIncident,
};
