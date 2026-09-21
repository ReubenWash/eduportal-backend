const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { sendReportCardEmail } = require("./email.service");
const logger = require("../config/logger");
const { computePositions } = require("../utils/gradeEngine");
const { className: formatClassName } = require("../utils/fileNames");

// ── Generate report(s) ─────────────────────────────────────────
const generateReports = async (schoolId, { termId, studentId, classId }) => {
  try {
    if (!termId) throw createError("Term ID is required.", 400);
    if (!studentId && !classId) throw createError("Provide studentId or classId.", 400);

    let studentIds = [];

    if (studentId) {
      const s = await prisma.student.findFirst({ 
        where: { id: studentId, schoolId } 
      });
      if (!s) throw createError("Student not found.", 404);
      studentIds = [studentId];
    } else {
      const enrollments = await prisma.enrollment.findMany({
        where: { 
          classId, 
          termId, 
          student: { schoolId } 
        },
        select: { studentId: true },
      });
      studentIds = enrollments.map((e) => e.studentId);
      if (studentIds.length === 0) {
        throw createError("No students enrolled in this class for this term.", 400);
      }
    }

    const reportIds = [];

    for (const sId of studentIds) {
      // Get scores for aggregate calculation
      const scores = await prisma.score.findMany({
        where: { studentId: sId, termId },
        select: { total: true }
      });

      // Calculate aggregate (average)
      let aggregate = null;
      if (scores.length > 0) {
        const totalScore = scores.reduce((sum, s) => sum + (s.total || 0), 0);
        aggregate = Math.round(totalScore / scores.length);
      }

      // Attendance totals
      const attendance = await prisma.attendance.findMany({ 
        where: { studentId: sId, termId } 
      });
      const daysPresent = attendance.filter((a) => a.status === "PRESENT").length;
      const daysAbsent  = attendance.filter((a) => a.status === "ABSENT").length;
      const daysLate    = attendance.filter((a) => a.status === "LATE").length;
      const totalSchoolDays = daysPresent + daysAbsent + daysLate;

      // Upsert draft report with aggregate
      const report = await prisma.report.upsert({
        where: { 
          studentId_termId: { studentId: sId, termId } 
        },
        create: {
          studentId: sId,
          termId,
          aggregate,
          daysPresent,
          daysAbsent,
          daysLate,
          totalSchoolDays: totalSchoolDays || 0,
          status: "DRAFT",
        },
        update: {
          aggregate,
          daysPresent,
          daysAbsent,
          daysLate,
          totalSchoolDays: totalSchoolDays || 0,
        },
      });

      reportIds.push(report.id);
    }

    // One ranking rule everywhere: class position = rank by average total score.
    // (score.service also writes classPosition using a different rule; ranking here,
    // after the reports exist, keeps drafts, approved and released cards consistent.)
    const enrolled = await prisma.enrollment.findMany({
      where: { studentId: { in: studentIds }, termId },
      select: { classId: true },
      distinct: ["classId"],
    });
    for (const e of enrolled) {
      await updateClassPositions(schoolId, e.classId, termId);
    }

    const { generateBulkPDFs } = require("./pdf.service");
    const pdfResult = await generateBulkPDFs(reportIds);
    logger.info(`Bulk PDF generation complete: ${pdfResult.success} success, ${pdfResult.failed} failed`);

    return { 
      generated: reportIds.length, 
      reportIds, 
      pdfGenerated: pdfResult.success,
      pdfFailed: pdfResult.failed,
      message: "Reports generated and PDFs are ready for download/preview." 
    };
  } catch (error) {
    logger.error("Generate reports error:", error);
    throw error;
  }
};

// ── Who is this user? Helpers for role-based report access ─────
const ADMIN_ROLES = ["SCHOOL_ADMIN", "SUPER_ADMIN"];

// Ids of the classes where this user is the class teacher
const getTeacherClassIds = async (user, schoolId) => {
  const staff = await prisma.staff.findFirst({
    where: { userId: user.userId, schoolId },
    select: { id: true },
  });
  if (!staff) return [];
  const classes = await prisma.class.findMany({
    where: { classTeacherId: staff.id, schoolId },
    select: { id: true },
  });
  return classes.map((c) => c.id);
};

// Classes the user can write report remarks for: admins see every class, class teachers their own
const getMyReportClasses = async (user) => {
  const schoolId = user.schoolId;
  const where = { schoolId };
  if (!ADMIN_ROLES.includes(user.role)) {
    const ids = await getTeacherClassIds(user, schoolId);
    if (ids.length === 0) return [];
    where.id = { in: ids };
  }
  return prisma.class.findMany({
    where,
    orderBy: [{ level: "asc" }, { section: "asc" }],
    select: {
      id: true, level: true, section: true, academicYear: true,
      classTeacher: { select: { id: true, firstName: true, lastName: true } },
    },
  });
};

// Loads a report and checks that this user is allowed to see it:
//  - school admin / super admin: any report of their school
//  - class teacher: only students of their own class in that term
//  - student / parent: only their own (or their child's) report, and only once RELEASED
const assertReportAccess = async (user, reportId) => {
  const report = await prisma.report.findFirst({
    where: { id: reportId, ...(user.role === "SUPER_ADMIN" ? {} : { student: { schoolId: user.schoolId } }) },
    include: { student: { select: { id: true, userId: true } } },
  });
  if (!report) throw createError("Report not found.", 404);

  if (ADMIN_ROLES.includes(user.role)) return report;

  if (user.role === "CLASS_TEACHER") {
    const classIds = await getTeacherClassIds(user, user.schoolId);
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: report.studentId, termId: report.termId, classId: { in: classIds } },
      select: { id: true },
    });
    if (enrollment) return report;
    throw createError("You can only access reports for students in your own class.", 403);
  }

  if (user.role === "STUDENT" && report.student.userId === user.userId) {
    if (report.status === "RELEASED") return report;
    throw createError("This report card has not been released yet.", 403);
  }

  if (user.role === "PARENT") {
    const link = await prisma.studentGuardian.findFirst({
      where: { studentId: report.studentId, guardian: { userId: user.userId } },
      select: { studentId: true },
    });
    if (link) {
      if (report.status === "RELEASED") return report;
      throw createError("This report card has not been released yet.", 403);
    }
  }

  throw createError("You do not have access to this report.", 403);
};

// ── List / filter reports ──────────────────────────────────────
const getReports = async (schoolId, { classId, termId, studentId, status } = {}, user = null) => {
  try {
    let classIds = null;

    if (user) {
      if (user.role === "CLASS_TEACHER") {
        const own = await getTeacherClassIds(user, schoolId);
        if (own.length === 0) return [];
        if (classId && !own.includes(classId)) {
          throw createError("You can only view reports for your own class.", 403);
        }
        classIds = classId ? [classId] : own;
      } else if (!ADMIN_ROLES.includes(user.role)) {
        throw createError("You do not have access to report cards.", 403);
      }
    }

    const enrollmentFilter = classIds
      ? { some: { classId: { in: classIds }, ...(termId && { termId }) } }
      : classId
        ? { some: { classId, ...(termId && { termId }) } }
        : undefined;

    const where = {
      student: {
        schoolId,
        ...(enrollmentFilter && { enrollments: enrollmentFilter }),
      },
      ...(termId && { termId }),
      ...(studentId && { studentId }),
      ...(status && { status }),
    };

    return prisma.report.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            studentNumber: true,
            photoUrl: true,
            enrollments: {
              where: { termId: termId || undefined },
              include: { class: true }
            }
          },
        },
        term: {
          select: {
            id: true,
            academicYear: true,
            termNumber: true
          }
        },
      },
      orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
    });
  } catch (error) {
    logger.error("Get reports error:", error);
    throw error;
  }
};

// ── Get single report ──────────────────────────────────────────
const getReport = async (schoolId, reportId) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: reportId, student: { schoolId } },
      include: {
        student: {
          select: {
            id: true, 
            firstName: true, 
            lastName: true, 
            otherNames: true,
            studentNumber: true, 
            gender: true, 
            dateOfBirth: true, 
            photoUrl: true,
          },
        },
        term: {
          include: {
            school: { 
              select: { 
                name: true, 
                logoUrl: true, 
                motto: true, 
                address: true 
              } 
            },
          },
        },
      },
    });

    if (!report) throw createError("Report not found.", 404);

    const scores = await prisma.score.findMany({
      where: { 
        studentId: report.studentId, 
        termId: report.termId 
      },
      include: { 
        subject: { 
          select: { 
            name: true, 
            code: true, 
            type: true 
          } 
        } 
      },
      orderBy: [
        { subject: { type: "asc" } }, 
        { subject: { name: "asc" } }
      ],
    });

    return { ...report, scores };
  } catch (error) {
    logger.error("Get report error:", error);
    throw error;
  }
};

const getReportForPdf = async (schoolId, reportId) => {
  const report = await prisma.report.findFirst({
    where: { id: reportId, student: { schoolId } },
    select: { id: true, pdfUrl: true, studentId: true, termId: true, status: true },
  });

  if (!report) throw createError("Report not found.", 404);

  if (!report.pdfUrl) {
    const { generateReportPDF } = require("./pdf.service");
    const pdfUrl = await generateReportPDF(reportId);
    await prisma.report.update({ where: { id: reportId }, data: { pdfUrl } });
    report.pdfUrl = pdfUrl;
  }

  return report;
};

// ── Preview report HTML (no PDF, instant) ─────────────────────
const previewReport = async (schoolId, reportId) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: reportId, student: { schoolId } },
    });
    if (!report) throw createError("Report not found.", 404);
    
    const { previewReportHTML } = require("./pdf.service");
    return previewReportHTML(reportId);
  } catch (error) {
    logger.error("Preview report error:", error);
    throw error;
  }
};

// ── Regenerate PDF for a single report ────────────────────────
const regeneratePDF = async (schoolId, reportId) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: reportId, student: { schoolId } },
    });
    if (!report) throw createError("Report not found.", 404);

    const { generateReportPDF } = require("./pdf.service");
    const pdfUrl = await generateReportPDF(reportId);
    
    // Update report with new PDF URL
    await prisma.report.update({
      where: { id: reportId },
      data: { pdfUrl }
    });
    
    return { reportId, pdfUrl };
  } catch (error) {
    logger.error("Regenerate PDF error:", error);
    throw error;
  }
};

// ── Update remarks ─────────────────────────────────────────────
// Class teachers (own class, DRAFT reports only) can set: teacherRemark, attitude,
// conduct, interest, promotedTo. Only admins can also set headRemark, and admins can
// edit APPROVED reports. Nothing can be changed once a report is RELEASED.
const REMARK_FIELDS = ["teacherRemark", "attitude", "conduct", "interest", "promotedTo"];

const cleanText = (v) => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};

const updateRemarks = async (user, reportId, body = {}) => {
  try {
    const report = await assertReportAccess(user, reportId);
    const isAdmin = ADMIN_ROLES.includes(user.role);

    if (report.status === "RELEASED") {
      throw createError("Cannot update remarks on a released report.", 400);
    }
    if (!isAdmin && report.status !== "DRAFT") {
      throw createError("This report has already been approved. Ask the school admin to make changes.", 400);
    }

    const data = {};
    for (const field of REMARK_FIELDS) {
      if (body[field] !== undefined) data[field] = cleanText(body[field]);
    }
    if (isAdmin && body.headRemark !== undefined) data.headRemark = cleanText(body.headRemark);

    return prisma.report.update({ where: { id: reportId }, data });
  } catch (error) {
    logger.error("Update remarks error:", error);
    throw error;
  }
};

// ── Approve ────────────────────────────────────────────────────
const approveReport = async (schoolId, reportId) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: reportId, student: { schoolId } },
    });
    if (!report) throw createError("Report not found.", 404);
    if (report.status !== "DRAFT") {
      throw createError("Only DRAFT reports can be approved.", 400);
    }

    // Always rebuild the stored PDF at approval: remarks and positions are entered after the
    // drafts are generated, and the stored copy is what parents receive by email.
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: report.studentId, termId: report.termId },
      select: { classId: true },
    });
    if (enrollment) {
      await updateClassPositions(schoolId, enrollment.classId, report.termId);
    }

    const { generateReportPDF } = require("./pdf.service");
    await generateReportPDF(reportId); // also saves the new pdfUrl

    return prisma.report.update({
      where: { id: reportId },
      data: { status: "APPROVED" }
    });
  } catch (error) {
    logger.error("Approve report error:", error);
    throw error;
  }
};

// ── Release ────────────────────────────────────────────────────
const releaseReport = async (schoolId, reportId) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: reportId, student: { schoolId } },
    });
    if (!report) throw createError("Report not found.", 404);
    
    // Check if report is already released
    if (report.status === "RELEASED") {
      throw createError("Report is already released.", 400);
    }
    
    // Check if report is APPROVED
    if (report.status !== "APPROVED") {
      throw createError(`Only APPROVED reports can be released. Current status: ${report.status}`, 400);
    }
    
    // Check if PDF exists, if not generate it
    let pdfUrl = report.pdfUrl;
    if (!pdfUrl) {
      logger.info(`No PDF found for report ${reportId}, generating...`);
      const { generateReportPDF } = require("./pdf.service");
      pdfUrl = await generateReportPDF(reportId);
      
      // Update report with PDF URL
      await prisma.report.update({
        where: { id: reportId },
        data: { pdfUrl }
      });
    }

    // Release the report
    const released = await prisma.report.update({
      where: { id: reportId },
      data: { 
        status: "RELEASED", 
        releasedAt: new Date() 
      },
    });

    // Update class positions
    try {
      // Get the student's class for this term
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          studentId: report.studentId,
          termId: report.termId
        },
        select: { classId: true }
      });

      if (enrollment) {
        await updateClassPositions(schoolId, enrollment.classId, report.termId);
      }
    } catch (posError) {
      logger.error("Failed to update class positions:", posError.message);
    }

    return released;
  } catch (error) {
    logger.error("Release report error:", error);
    throw error;
  }
};

// ── Bulk release ───────────────────────────────────────────────
const bulkReleaseReports = async (schoolId, classId, termId) => {
  try {
    if (!classId || !termId) {
      throw createError("Class ID and Term ID are required.", 400);
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { 
        classId, 
        termId, 
        student: { schoolId } 
      },
      select: { studentId: true },
    });

    const studentIds = enrollments.map((e) => e.studentId);

    if (studentIds.length === 0) {
      throw createError("No students found in this class for this term.", 404);
    }

    const reports = await prisma.report.findMany({
      where: {
        studentId: { in: studentIds },
        termId,
      },
      select: {
        id: true,
        studentId: true,
        pdfUrl: true,
        status: true
      }
    });

    return await releaseReportGroup(schoolId, reports, { classId, termId });
  } catch (error) {
    logger.error("Bulk release reports error:", error);
    throw error;
  }
};

const bulkReleaseReportsByIds = async (schoolId, reportIds) => {
  try {
    if (!Array.isArray(reportIds) || reportIds.length === 0) {
      throw createError("At least one report ID is required.", 400);
    }

    const reports = await prisma.report.findMany({
      where: {
        id: { in: reportIds },
        student: { schoolId }
      },
      select: {
        id: true,
        studentId: true,
        termId: true,
        pdfUrl: true,
        status: true,
        classPosition: true,
        totalStudents: true,
      }
    });

    if (reports.length === 0) {
      throw createError("No matching reports found for release.", 404);
    }

    return await releaseReportGroup(schoolId, reports, { classId: null, termId: null });
  } catch (error) {
    logger.error("Bulk release by IDs error:", error);
    throw error;
  }
};

const releaseReportGroup = async (schoolId, reports, context) => {
  const reportsWithoutPdf = reports.filter(r => !r.pdfUrl);
  const approvedReports = reports.filter(r => r.status === 'APPROVED' && r.pdfUrl);
  const reportIdsToRelease = approvedReports.map(r => r.id);

  if (reportsWithoutPdf.length > 0) {
    logger.info(`Generating PDFs for ${reportsWithoutPdf.length} reports...`);
    const { generateBulkPDFs } = require("./pdf.service");
    const pdfResults = await generateBulkPDFs(reportsWithoutPdf.map(r => r.id));

    for (const result of pdfResults.results || []) {
      if (result.success) {
        await prisma.report.update({
          where: { id: result.reportId },
          data: {
            pdfUrl: result.pdfUrl,
            status: 'APPROVED'
          }
        });
        reportIdsToRelease.push(result.reportId);
      }
    }
  }

  const updateMany = await prisma.report.updateMany({
    where: {
      id: { in: reportIdsToRelease },
      status: "APPROVED",
      pdfUrl: { not: null },
    },
    data: {
      status: "RELEASED",
      releasedAt: new Date()
    },
  });

  const uniqueTermIds = [...new Set(reports.map(r => r.termId).filter(Boolean))];
  const uniqueClassIds = context.classId ? [context.classId] : [...new Set((await prisma.enrollment.findMany({
    where: { studentId: { in: reports.map(r => r.studentId) }, termId: { in: uniqueTermIds } },
    select: { classId: true }
  })).map(e => e.classId))];

  for (const termId of uniqueTermIds) {
    for (const classId of uniqueClassIds) {
      if (classId && termId) {
        await updateClassPositions(schoolId, classId, termId);
      }
    }
  }

  return { released: updateMany.count };
};

// ── Helper: Update class positions ────────────────────────────
// Rank every student of the class by AVERAGE TOTAL SCORE (ties share a position).
// Positions are written to whatever report rows exist (draft, approved or released).
const updateClassPositions = async (schoolId, classId, termId) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { classId, termId, student: { schoolId } },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);
    if (studentIds.length === 0) return { updated: 0 };

    const scores = await prisma.score.findMany({
      where: { termId, studentId: { in: studentIds }, total: { not: null } },
      select: { studentId: true, total: true },
    });

    const sums = new Map();
    for (const s of scores) {
      const cur = sums.get(s.studentId) || { sum: 0, n: 0 };
      cur.sum += s.total;
      cur.n += 1;
      sums.set(s.studentId, cur);
    }

    const ranked = computePositions(
      [...sums.entries()].map(([studentId, c]) => ({ studentId, total: c.sum / c.n }))
    );

    for (const r of ranked) {
      await prisma.report.updateMany({
        where: { studentId: r.studentId, termId },
        data: { classPosition: r.position, totalStudents: studentIds.length },
      });
    }

    return { updated: ranked.length };
  } catch (error) {
    logger.error("Update class positions error:", error);
    throw error;
  }
};

// ── Email reports to parents ───────────────────────────────────
const emailReports = async (schoolId, { termId, classId, studentId }) => {
  try {
    let studentIds = [];

    if (studentId) {
      studentIds = [studentId];
    } else if (classId) {
      const enrollments = await prisma.enrollment.findMany({
        where: { 
          classId, 
          termId, 
          student: { schoolId } 
        },
        select: { studentId: true },
      });
      studentIds = enrollments.map((e) => e.studentId);
    } else {
      throw createError("Provide studentId or classId.", 400);
    }

    if (studentIds.length === 0) {
      throw createError("No students found.", 404);
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });

    const term = await prisma.term.findUnique({ 
      where: { id: termId } 
    });
    const termLabel = `${term.academicYear} ${term.termNumber.replace("TERM", "Term ")}`;

    let sent = 0, failed = 0;

    for (const sId of studentIds) {
      const report = await prisma.report.findFirst({
        where: { 
          studentId: sId, 
          termId, 
          status: "RELEASED", 
          pdfUrl: { not: null } 
        },
        include: { 
          student: true 
        },
      });
      
      if (!report) { 
        failed++; 
        continue; 
      }

      const guardians = await prisma.studentGuardian.findMany({
        where: { studentId: sId },
        include: { 
          guardian: { 
            select: { 
              firstName: true, 
              email: true 
            } 
          } 
        },
      });

      const emailableGuardians = guardians.filter((g) => g.guardian.email);
      if (emailableGuardians.length === 0) { 
        failed++; 
        continue; 
      }

      for (const g of emailableGuardians) {
        try {
          const studentName = `${report.student.firstName} ${report.student.lastName}`;
          await sendReportCardEmail(
            g.guardian.email,
            g.guardian.firstName,
            studentName,
            termLabel,
            report.pdfUrl,
            school?.name || "School"
          );
          sent++;
        } catch (err) {
          logger.error(`Failed to email report to ${g.guardian.email}:`, err.message);
          failed++;
        }
      }
    }

    return { sent, failed };
  } catch (error) {
    logger.error("Email reports error:", error);
    throw error;
  }
};

// ── Reports of one class + term that this user may download (bulk PDF / ZIP) ──
// Admins: any class of their school. Class teachers: only their own class.
// By default only RELEASED cards are included; `includeDrafts` adds draft/approved ones for proof-reading.
const getClassReportSet = async (user, classId, termId, { includeDrafts = false } = {}) => {
  try {
    if (!classId || !termId) {
      throw createError("Class ID and Term ID are required.", 400);
    }

    const schoolId = user.schoolId;
    const cls = await prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true, level: true, section: true },
    });
    if (!cls) throw createError("Class not found.", 404);

    if (user.role === "CLASS_TEACHER") {
      const own = await getTeacherClassIds(user, schoolId);
      if (!own.includes(classId)) throw createError("You can only download reports for your own class.", 403);
    } else if (!ADMIN_ROLES.includes(user.role)) {
      throw createError("You do not have access to class reports.", 403);
    }

    const term = await prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw createError("Term not found.", 404);

    const enrollments = await prisma.enrollment.findMany({
      where: { classId, termId },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);
    if (studentIds.length === 0) {
      throw createError("No students enrolled in this class for this term.", 400);
    }

    const reports = await prisma.report.findMany({
      where: {
        studentId: { in: studentIds },
        termId,
        ...(includeDrafts ? {} : { status: "RELEASED" }),
      },
      include: { student: { select: { firstName: true, lastName: true, otherNames: true, studentNumber: true } } },
    });

    if (reports.length === 0) {
      throw createError(
        includeDrafts
          ? "No report cards have been generated for this class yet."
          : "No released report cards for this class yet. Release them first, or include the unreleased ones.",
        400
      );
    }

    reports.sort((a, b) =>
      String(a.student.lastName).localeCompare(String(b.student.lastName)) ||
      String(a.student.firstName).localeCompare(String(b.student.firstName))
    );

    return { classLabel: formatClassName(cls.level, cls.section), term, reports };
  } catch (error) {
    logger.error("Get class report set error:", error);
    throw error;
  }
};

// ── Get report statistics ──────────────────────────────────────
const getReportStats = async (schoolId, termId) => {
  try {
    const stats = await prisma.report.groupBy({
      by: ['status'],
      where: {
        termId,
        student: { schoolId }
      },
      _count: {
        status: true
      }
    });

    const result = {
      total: 0,
      draft: 0,
      approved: 0,
      released: 0
    };

    stats.forEach(stat => {
      result[stat.status.toLowerCase()] = stat._count.status;
      result.total += stat._count.status;
    });

    return result;
  } catch (error) {
    logger.error("Get report stats error:", error);
    throw error;
  }
};

// ─── Send single report email ──────────────────────────────────
const sendSingleReportEmail = async (schoolId, reportId) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: reportId, student: { schoolId } },
      include: {
        student: true,
        term: true
      }
    });

    if (!report) {
      throw createError("Report not found", 404);
    }

    if (report.status !== 'RELEASED') {
      throw createError("Report must be RELEASED before emailing", 400);
    }

    if (!report.pdfUrl) {
      throw createError("PDF has not been generated for this report", 400);
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true }
    });

    const guardians = await prisma.studentGuardian.findMany({
      where: { studentId: report.studentId },
      include: {
        guardian: {
          select: { firstName: true, email: true }
        }
      }
    });

    const emailableGuardians = guardians.filter(g => g.guardian.email);
    if (emailableGuardians.length === 0) {
      throw createError("No guardian email found for this student", 404);
    }

    const termLabel = `${report.term.academicYear} ${report.term.termNumber.replace("TERM", "Term ")}`;
    const studentName = `${report.student.firstName} ${report.student.lastName}`;

    let sent = 0, failed = 0;

    for (const g of emailableGuardians) {
      try {
        await sendReportCardEmail(
          g.guardian.email,
          g.guardian.firstName,
          studentName,
          termLabel,
          report.pdfUrl,
          school?.name || 'School'
        );
        sent++;
      } catch (err) {
        logger.error(`Failed to email report: ${err.message}`);
        failed++;
      }
    }

    return { sent, failed, total: emailableGuardians.length };
  } catch (error) {
    logger.error("Send single report email error:", error);
    throw error;
  }
};

module.exports = {
  assertReportAccess,
  getMyReportClasses,
  generateReports,
  getReports,
  getReport,
  getReportForPdf,
  previewReport,
  regeneratePDF,
  updateRemarks,
  approveReport,
  releaseReport,
  bulkReleaseReports,
  bulkReleaseReportsByIds,
  emailReports,
  getClassReportSet,
  getReportStats,
  sendSingleReportEmail,
};