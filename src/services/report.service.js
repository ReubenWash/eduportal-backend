const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { sendReportCardEmail } = require("./email.service");
const logger = require("../config/logger");

// ── Generate report(s) ─────────────────────────────────────────
const generateReports = async (schoolId, { termId, studentId, classId }) => {
  if (!studentId && !classId) throw createError("Provide studentId or classId.", 400);

  let studentIds = [];

  if (studentId) {
    const s = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!s) throw createError("Student not found.", 404);
    studentIds = [studentId];
  } else {
    const enrollments = await prisma.enrollment.findMany({
      where:  { classId, termId, student: { schoolId } },
      select: { studentId: true },
    });
    studentIds = enrollments.map((e) => e.studentId);
    if (studentIds.length === 0) throw createError("No students enrolled in this class for this term.", 400);
  }

  const reportIds = [];

  for (const sId of studentIds) {
    // Attendance totals
    const attendance  = await prisma.attendance.findMany({ where: { studentId: sId, termId } });
    const daysPresent = attendance.filter((a) => a.status === "PRESENT").length;
    const daysAbsent  = attendance.filter((a) => a.status === "ABSENT").length;
    const daysLate    = attendance.filter((a) => a.status === "LATE").length;

    // Upsert draft report
    const report = await prisma.report.upsert({
      where:  { studentId_termId: { studentId: sId, termId } },
      create: {
        studentId:  sId,
        termId,
        daysPresent,
        daysAbsent,
        daysLate,
        totalSchoolDays: daysPresent + daysAbsent + daysLate,
        status: "DRAFT",
      },
      update: {
        daysPresent,
        daysAbsent,
        daysLate,
        totalSchoolDays: daysPresent + daysAbsent + daysLate,
      },
    });

    reportIds.push(report.id);
  }

  // Trigger PDF generation asynchronously (non-blocking)
  // In production this would be queued via a job queue (Bull/BullMQ)
  setImmediate(async () => {
    try {
      const { generateBulkPDFs } = require("./pdf.service");
      const result = await generateBulkPDFs(reportIds);
      logger.info(`Bulk PDF generation complete: ${result.success} success, ${result.failed} failed`);
    } catch (err) {
      logger.error("Async PDF generation error:", err.message);
    }
  });

  return { generated: reportIds.length, reportIds, message: "Reports queued for PDF generation." };
};

// ── Get single report ──────────────────────────────────────────
const getReport = async (schoolId, reportId) => {
  const report = await prisma.report.findFirst({
    where: { id: reportId, student: { schoolId } },
    include: {
      student: {
        select: {
          id: true, firstName: true, lastName: true, otherNames: true,
          studentNumber: true, gender: true, dateOfBirth: true, photoUrl: true,
        },
      },
      term: {
        include: {
          school: { select: { name: true, logoUrl: true, motto: true, address: true } },
        },
      },
    },
  });

  if (!report) throw createError("Report not found.", 404);

  const scores = await prisma.score.findMany({
    where:   { studentId: report.studentId, termId: report.termId },
    include: { subject: { select: { name: true, code: true, type: true } } },
    orderBy: [{ subject: { type: "asc" } }, { subject: { name: "asc" } }],
  });

  return { ...report, scores };
};

// ── Preview report HTML (no PDF, instant) ─────────────────────
const previewReport = async (schoolId, reportId) => {
  const report = await prisma.report.findFirst({
    where: { id: reportId, student: { schoolId } },
  });
  if (!report) throw createError("Report not found.", 404);
  const { previewReportHTML } = require("./pdf.service");
  return previewReportHTML(reportId);
};

// ── Regenerate PDF for a single report ────────────────────────
const regeneratePDF = async (schoolId, reportId) => {
  const report = await prisma.report.findFirst({
    where: { id: reportId, student: { schoolId } },
  });
  if (!report) throw createError("Report not found.", 404);

  const { generateReportPDF } = require("./pdf.service");
  const pdfUrl = await generateReportPDF(reportId);
  return { reportId, pdfUrl };
};

// ── Update remarks ─────────────────────────────────────────────
const updateRemarks = async (schoolId, reportId, { teacherRemark, headRemark }) => {
  const report = await prisma.report.findFirst({
    where: { id: reportId, student: { schoolId } },
  });
  if (!report) throw createError("Report not found.", 404);

  return prisma.report.update({
    where: { id: reportId },
    data: {
      ...(teacherRemark !== undefined && { teacherRemark }),
      ...(headRemark    !== undefined && { headRemark    }),
    },
  });
};

// ── Approve ────────────────────────────────────────────────────
const approveReport = async (schoolId, reportId) => {
  const report = await prisma.report.findFirst({
    where: { id: reportId, student: { schoolId } },
  });
  if (!report) throw createError("Report not found.", 404);
  if (report.status !== "DRAFT") throw createError("Only DRAFT reports can be approved.", 400);

  return prisma.report.update({ where: { id: reportId }, data: { status: "APPROVED" } });
};

// ── Release ────────────────────────────────────────────────────
const releaseReport = async (schoolId, reportId) => {
  const report = await prisma.report.findFirst({
    where: { id: reportId, student: { schoolId } },
  });
  if (!report) throw createError("Report not found.", 404);
  if (report.status !== "APPROVED") throw createError("Only APPROVED reports can be released.", 400);
  if (!report.pdfUrl) throw createError("PDF has not been generated yet. Please regenerate.", 400);

  return prisma.report.update({
    where: { id: reportId },
    data:  { status: "RELEASED", releasedAt: new Date() },
  });
};

// ── Bulk release ───────────────────────────────────────────────
const bulkReleaseReports = async (schoolId, classId, termId) => {
  const enrollments = await prisma.enrollment.findMany({
    where:  { classId, termId, student: { schoolId } },
    select: { studentId: true },
  });

  const studentIds = enrollments.map((e) => e.studentId);

  const result = await prisma.report.updateMany({
    where: {
      studentId: { in: studentIds },
      termId,
      status:    "APPROVED",
      pdfUrl:    { not: null },
    },
    data: { status: "RELEASED", releasedAt: new Date() },
  });

  return { released: result.count };
};

// ── Email reports to parents ───────────────────────────────────
const emailReports = async (schoolId, { termId, classId, studentId }) => {
  let studentIds = [];

  if (studentId) {
    studentIds = [studentId];
  } else if (classId) {
    const enrollments = await prisma.enrollment.findMany({
      where:  { classId, termId, student: { schoolId } },
      select: { studentId: true },
    });
    studentIds = enrollments.map((e) => e.studentId);
  }

  const school = await prisma.school.findUnique({
    where:  { id: schoolId },
    select: { name: true },
  });

  const term = await prisma.term.findUnique({ where: { id: termId } });
  const termLabel = `${term.academicYear} ${term.termNumber.replace("TERM", "Term ")}`;

  let sent = 0, failed = 0;

  for (const sId of studentIds) {
    const report = await prisma.report.findFirst({
      where:   { studentId: sId, termId, status: "RELEASED", pdfUrl: { not: null } },
      include: { student: true },
    });
    if (!report) { failed++; continue; }

    const guardians = await prisma.studentGuardian.findMany({
      where:   { studentId: sId },
      include: { guardian: { select: { firstName: true, email: true } } },
    });

    const emailableGuardians = guardians.filter((g) => g.guardian.email);
    if (emailableGuardians.length === 0) { failed++; continue; }

    for (const g of emailableGuardians) {
      try {
        const studentName = `${report.student.firstName} ${report.student.lastName}`;
        await sendReportCardEmail(
          g.guardian.email,
          g.guardian.firstName,
          studentName,
          termLabel,
          report.pdfUrl,
          school.name
        );
        sent++;
      } catch (err) {
        logger.error(`Failed to email report to ${g.guardian.email}:`, err.message);
        failed++;
      }
    }
  }

  return { sent, failed };
};

// ── Download class ZIP ─────────────────────────────────────────
const getClassZIPPath = async (schoolId, classId, termId) => {
  const { generateClassZIP } = require("./pdf.service");
  return generateClassZIP(schoolId, classId, termId);
};

module.exports = {
  generateReports,
  getReport,
  previewReport,
  regeneratePDF,
  updateRemarks,
  approveReport,
  releaseReport,
  bulkReleaseReports,
  emailReports,
  getClassZIPPath,
};
