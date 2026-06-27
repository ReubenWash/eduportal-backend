const { prisma }   = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const {
  computeScore,
  computePositions,
  computeAggregate,
} = require("../utils/gradeEngine");

const submitScore = async (schoolId, data) => {
  const { studentId, subjectId, termId, ca1, ca2, ca3, examScore } = data;

  // Verify student belongs to school
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw createError("Student not found.", 404);

  // Compute grade
  const computed = computeScore({ ca1, ca2, ca3, examScore });

  return prisma.score.upsert({
    where:  { studentId_subjectId_termId: { studentId, subjectId, termId } },
    create: {
      studentId, subjectId, termId,
      ca1: ca1 ?? null, ca2: ca2 ?? null, ca3: ca3 ?? null,
      caTotal:    computed.caTotal,
      examScore:  examScore ?? null,
      total:      computed.total,
      grade:      computed.grade,
      remark:     computed.remark,
    },
    update: {
      ca1: ca1 ?? null, ca2: ca2 ?? null, ca3: ca3 ?? null,
      caTotal:   computed.caTotal,
      examScore: examScore ?? null,
      total:     computed.total,
      grade:     computed.grade,
      remark:    computed.remark,
    },
  });
};

const getScores = async (schoolId, query) => {
  const { subjectId, classId, termId } = query;
  if (!subjectId || !termId) throw createError("subjectId and termId are required.", 400);

  return prisma.score.findMany({
    where: {
      subjectId,
      termId,
      student: { schoolId },
      ...(classId && {
        student: {
          schoolId,
          enrollments: { some: { classId, termId } },
        },
      }),
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
      subject: { select: { name: true, code: true } },
    },
    orderBy: { total: "desc" },
  });
};

const updateScore = async (schoolId, scoreId, data) => {
  const score = await prisma.score.findFirst({
    where: { id: scoreId, student: { schoolId } },
  });
  if (!score) throw createError("Score not found.", 404);

  const merged = {
    ca1:       data.ca1       ?? score.ca1,
    ca2:       data.ca2       ?? score.ca2,
    ca3:       data.ca3       ?? score.ca3,
    examScore: data.examScore ?? score.examScore,
  };

  const computed = computeScore(merged);

  return prisma.score.update({
    where: { id: scoreId },
    data: {
      ...merged,
      caTotal:   computed.caTotal,
      total:     computed.total,
      grade:     computed.grade,
      remark:    computed.remark,
    },
  });
};

const computeClassGrades = async (schoolId, classId, termId) => {
  // Get all students enrolled in the class for this term
  const enrollments = await prisma.enrollment.findMany({
    where: { classId, termId, student: { schoolId } },
    select: { studentId: true },
  });

  const studentIds = enrollments.map((e) => e.studentId);
  if (studentIds.length === 0) throw createError("No students enrolled in this class.", 400);

  // Get all subjects for this class
  const classSubjects = await prisma.classSubject.findMany({
    where:  { classId },
    select: { subjectId: true },
  });
  const subjectIds = classSubjects.map((cs) => cs.subjectId);

  let computedCount = 0;

  // Recompute grades for all student-subject combinations
  for (const studentId of studentIds) {
    for (const subjectId of subjectIds) {
      const score = await prisma.score.findFirst({
        where: { studentId, subjectId, termId },
      });
      if (!score) continue;

      const computed = computeScore({
        ca1:       score.ca1,
        ca2:       score.ca2,
        ca3:       score.ca3,
        examScore: score.examScore,
      });

      await prisma.score.update({
        where: { id: score.id },
        data: {
          caTotal:   computed.caTotal,
          total:     computed.total,
          grade:     computed.grade,
          remark:    computed.remark,
        },
      });
      computedCount++;
    }
  }

  // Compute positions per subject
  for (const subjectId of subjectIds) {
    const subjectScores = await prisma.score.findMany({
      where: { subjectId, termId, studentId: { in: studentIds }, total: { not: null } },
      select: { id: true, studentId: true, total: true },
    });

    const ranked = computePositions(subjectScores.map((s) => ({ studentId: s.studentId, total: s.total, id: s.id })));

    for (const r of ranked) {
      await prisma.score.update({ where: { id: r.id }, data: { position: r.position } });
    }
  }

  // Compute aggregate and overall position per student (JHS3 BECE prep)
  const studentAggregates = [];
  for (const studentId of studentIds) {
    const allGrades = await prisma.score.findMany({
      where:  { studentId, termId, grade: { not: null } },
      select: { grade: true },
    });

    const aggregate = computeAggregate(allGrades.map((g) => g.grade));
    studentAggregates.push({ studentId, aggregate });
  }

  // Rank students by aggregate (lower = better)
  const ranked = [...studentAggregates].sort((a, b) => a.aggregate - b.aggregate);
  let position = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && ranked[i].aggregate > ranked[i - 1].aggregate) position = i + 1;
    await prisma.report.upsert({
      where:  { studentId_termId: { studentId: ranked[i].studentId, termId } },
      create: { studentId: ranked[i].studentId, termId, classPosition: position, totalStudents: studentIds.length, aggregate: ranked[i].aggregate },
      update: { classPosition: position, totalStudents: studentIds.length, aggregate: ranked[i].aggregate },
    });
  }

  return { computed: computedCount, students: studentIds.length };
};

const getClassSummary = async (schoolId, classId, termId) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { classId, termId, student: { schoolId } },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
    },
  });

  const subjects = await prisma.classSubject.findMany({
    where:   { classId },
    include: { subject: { select: { id: true, name: true, code: true } } },
  });

  const summary = await Promise.all(
    enrollments.map(async (e) => {
      const scores = await prisma.score.findMany({
        where: { studentId: e.studentId, termId, subjectId: { in: subjects.map((s) => s.subjectId) } },
        include: { subject: { select: { name: true, code: true } } },
      });

      const report = await prisma.report.findFirst({
        where:  { studentId: e.studentId, termId },
        select: { classPosition: true, aggregate: true },
      });

      const scoreMap = {};
      scores.forEach((s) => {
        scoreMap[s.subject.code] = { total: s.total, grade: s.grade, remark: s.remark };
      });

      return {
        student:  e.student,
        scores:   scoreMap,
        position: report?.classPosition || null,
        aggregate: report?.aggregate   || null,
      };
    })
  );

  return summary.sort((a, b) => (a.position || 999) - (b.position || 999));
};

const getSubmissionStatus = async (schoolId, classId, termId) => {
  const classSubjects = await prisma.classSubject.findMany({
    where:   { classId },
    include: {
      subject: { select: { id: true, name: true, code: true } },
    },
  });

  const enrollmentCount = await prisma.enrollment.count({ where: { classId, termId } });

  const status = await Promise.all(
    classSubjects.map(async (cs) => {
      const submittedCount = await prisma.score.count({
        where: {
          subjectId: cs.subjectId,
          termId,
          examScore: { not: null },
          student:   { schoolId },
        },
      });

      const teacher = await prisma.staffSubject.findFirst({
        where:   { subjectId: cs.subjectId, classId },
        include: { staff: { select: { firstName: true, lastName: true } } },
      });

      return {
        subject:   cs.subject,
        teacher:   teacher?.staff || null,
        submitted: submittedCount === enrollmentCount && enrollmentCount > 0,
        submittedCount,
        totalStudents: enrollmentCount,
      };
    })
  );

  return status;
};

module.exports = {
  submitScore,
  getScores,
  updateScore,
  computeClassGrades,
  getClassSummary,
  getSubmissionStatus,
};
