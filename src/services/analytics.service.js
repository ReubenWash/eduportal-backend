const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");

const getSchoolPerformance = async (schoolId, termId) => {
  const scores = await prisma.score.findMany({
    where:  { termId, student: { schoolId }, total: { not: null } },
    select: { total: true, grade: true },
  });

  if (scores.length === 0) return { passRate: 0, averageScore: 0, gradeDistribution: {}, totalStudents: 0 };

  const totalStudents = await prisma.enrollment.count({
    where: { termId, student: { schoolId } },
  });

  const passed       = scores.filter((s) => s.total >= 50).length;
  const passRate     = Math.round((passed / scores.length) * 100);
  const averageScore = parseFloat((scores.reduce((sum, s) => sum + s.total, 0) / scores.length).toFixed(2));

  const gradeDistribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
  scores.forEach((s) => {
    if (s.grade && gradeDistribution[s.grade] !== undefined) gradeDistribution[s.grade]++;
  });

  return { passRate, averageScore, gradeDistribution, totalStudents };
};

const getSubjectAnalysis = async (schoolId, termId, classId) => {
  const subjects = await prisma.subject.findMany({ where: { schoolId } });

  const analysis = await Promise.all(
    subjects.map(async (subject) => {
      const scores = await prisma.score.findMany({
        where: {
          subjectId: subject.id,
          termId,
          total: { not: null },
          student: {
            schoolId,
            ...(classId && { enrollments: { some: { classId, termId } } }),
          },
        },
        select: { total: true, grade: true },
      });

      if (scores.length === 0) return null;

      const totals   = scores.map((s) => s.total);
      const passed   = scores.filter((s) => s.total >= 50).length;
      const average  = parseFloat((totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2));
      const highest  = Math.max(...totals);
      const lowest   = Math.min(...totals);
      const passRate = Math.round((passed / scores.length) * 100);

      const gradeDistribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
      scores.forEach((s) => { if (s.grade) gradeDistribution[s.grade]++; });

      return { subject: { id: subject.id, name: subject.name, code: subject.code }, average, passRate, highest, lowest, gradeDistribution, totalEntries: scores.length };
    })
  );

  return analysis.filter(Boolean);
};

const getTopStudents = async (schoolId, termId, limit, classId) => {
  const where = { termId, student: { schoolId } };
  if (classId) where.student = { schoolId, enrollments: { some: { classId, termId } } };

  const reports = await prisma.report.findMany({
    where: { termId, student: { schoolId }, classPosition: { not: null } },
    orderBy: { classPosition: "asc" },
    take: parseInt(limit) || 10,
    include: {
      student: {
        select: {
          id: true, firstName: true, lastName: true, studentNumber: true, gender: true,
          enrollments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { class: { select: { level: true, section: true } } },
          },
        },
      },
    },
  });

  return reports.map((r) => ({
    rank:      r.classPosition,
    student:   r.student,
    aggregate: r.aggregate,
    class:     r.student.enrollments[0]?.class || null,
  }));
};

const getPerformanceTrends = async (schoolId, academicYear, classId) => {
  const where = { schoolId };
  if (academicYear) where.academicYear = academicYear;

  const terms = await prisma.term.findMany({
    where,
    orderBy: [{ academicYear: "asc" }, { termNumber: "asc" }],
  });

  const trends = await Promise.all(
    terms.map(async (term) => {
      const scores = await prisma.score.findMany({
        where: {
          termId: term.id,
          total:  { not: null },
          student: {
            schoolId,
            ...(classId && { enrollments: { some: { classId, termId: term.id } } }),
          },
        },
        select: { total: true },
      });

      if (scores.length === 0) return null;

      const average  = parseFloat((scores.reduce((s, r) => s + r.total, 0) / scores.length).toFixed(2));
      const passed   = scores.filter((s) => s.total >= 50).length;
      const passRate = Math.round((passed / scores.length) * 100);

      return { term: { id: term.id, academicYear: term.academicYear, termNumber: term.termNumber }, averageScore: average, passRate };
    })
  );

  return trends.filter(Boolean);
};

const getGenderPerformance = async (schoolId, termId, classId) => {
  const genders = ["MALE", "FEMALE"];
  const result  = {};

  for (const gender of genders) {
    const scores = await prisma.score.findMany({
      where: {
        termId,
        total:   { not: null },
        student: {
          schoolId,
          gender,
          ...(classId && { enrollments: { some: { classId, termId } } }),
        },
      },
      select: { total: true },
    });

    result[gender.toLowerCase()] = {
      count:   scores.length,
      average: scores.length > 0
        ? parseFloat((scores.reduce((s, r) => s + r.total, 0) / scores.length).toFixed(2))
        : 0,
    };
  }

  return result;
};

module.exports = {
  getSchoolPerformance,
  getSubjectAnalysis,
  getTopStudents,
  getPerformanceTrends,
  getGenderPerformance,
};

// ── Export analytics data ──────────────────────────────────────
const exportAnalytics = async (schoolId, { type, termId, format }) => {
  if (!termId) throw require("../middleware/errorHandler").createError("termId is required.", 400);

  let data = [];
  let filename = "edutrack_export";

  switch (type) {
    case "class-summary": {
      const classes = await require("../config/db").prisma.class.findMany({ where: { schoolId } });
      for (const cls of classes) {
        const { getClassSummary } = require("./score.service");
        const summary = await getClassSummary(schoolId, cls.id, termId);
        data.push(...summary.map((r) => ({
          Class:     `${cls.level} ${cls.section}`,
          "Student No":  r.student.studentNumber,
          Name:      `${r.student.firstName} ${r.student.lastName}`,
          Position:  r.position,
          Aggregate: r.aggregate,
        })));
      }
      filename = `class_summary_${termId}`;
      break;
    }
    case "subject-analysis": {
      const analysis = await getSubjectAnalysis(schoolId, termId, null);
      data = analysis.map((a) => ({
        Subject:       a.subject.name,
        Code:          a.subject.code,
        "Average Score": a.average,
        "Pass Rate %":   a.passRate,
        Highest:       a.highest,
        Lowest:        a.lowest,
        "Total Entries": a.totalEntries,
      }));
      filename = `subject_analysis_${termId}`;
      break;
    }
    case "top-students": {
      const top = await getTopStudents(schoolId, termId, 50, null);
      data = top.map((t) => ({
        Rank:          t.rank,
        "Student No":  t.student.studentNumber,
        Name:          `${t.student.firstName} ${t.student.lastName}`,
        Gender:        t.student.gender,
        Aggregate:     t.aggregate,
        Class:         t.class ? `${t.class.level} ${t.class.section}` : "—",
      }));
      filename = `top_students_${termId}`;
      break;
    }
    case "attendance": {
      const prisma = require("../config/db").prisma;
      const classes = await prisma.class.findMany({ where: { schoolId } });
      for (const cls of classes) {
        const { getAttendanceSummary } = require("./attendance.service");
        const summary = await getAttendanceSummary(schoolId, cls.id, termId);
        data.push(...summary.map((s) => ({
          Class:    `${cls.level} ${cls.section}`,
          Name:     `${s.student.firstName} ${s.student.lastName}`,
          Present:  s.present,
          Absent:   s.absent,
          Late:     s.late,
          Excused:  s.excused,
          Total:    s.totalDays,
          "Attendance %": s.totalDays > 0 ? Math.round((s.present / s.totalDays) * 100) : 0,
        })));
      }
      filename = `attendance_${termId}`;
      break;
    }
    default:
      throw require("../middleware/errorHandler").createError("Invalid export type.", 400);
  }

  if (format === "excel") {
    return { data, filename: `${filename}.xlsx`, format: "excel" };
  }
  return { data, filename: `${filename}.csv`, format: "csv" };
};

module.exports.exportAnalytics = exportAnalytics;
