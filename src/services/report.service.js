const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { sendReportCardEmail } = require("./email.service");
const logger = require("../config/logger");

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

    // Trigger PDF generation asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        const { generateBulkPDFs } = require("./pdf.service");
        const result = await generateBulkPDFs(reportIds);
        logger.info(`Bulk PDF generation complete: ${result.success} success, ${result.failed} failed`);
      } catch (err) {
        logger.error("Async PDF generation error:", err.message);
      }
    });

    return { 
      generated: reportIds.length, 
      reportIds, 
      message: "Reports queued for PDF generation." 
    };
  } catch (error) {
    logger.error("Generate reports error:", error);
    throw error;
  }
};

// ── List / filter reports ──────────────────────────────────────
const getReports = async (schoolId, { classId, termId, studentId, status } = {}) => {
  try {
    const where = {
      student: { 
        schoolId, 
        ...(classId && { enrollments: { some: { classId } } }) 
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
      orderBy: { createdAt: "desc" },
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
const updateRemarks = async (schoolId, reportId, { teacherRemark, headRemark }) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: reportId, student: { schoolId } },
    });
    if (!report) throw createError("Report not found.", 404);

    // Check if report is already released
    if (report.status === "RELEASED") {
      throw createError("Cannot update remarks on a released report.", 400);
    }

    return prisma.report.update({
      where: { id: reportId },
      data: {
        ...(teacherRemark !== undefined && { teacherRemark }),
        ...(headRemark !== undefined && { headRemark }),
      },
    });
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

    // Get all reports for these students
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

    // Separate reports that need PDF generation
    const reportsWithoutPdf = reports.filter(r => !r.pdfUrl);
    const approvedReports = reports.filter(r => r.status === 'APPROVED' && r.pdfUrl);
    const reportIdsToRelease = approvedReports.map(r => r.id);

    // Generate PDFs for reports that don't have them
    if (reportsWithoutPdf.length > 0) {
      logger.info(`Generating PDFs for ${reportsWithoutPdf.length} reports...`);
      const { generateBulkPDFs } = require("./pdf.service");
      const pdfResults = await generateBulkPDFs(reportsWithoutPdf.map(r => r.id));
      
      // Update reports with PDF URLs and approve them
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

    // Release all approved reports
    const result = await prisma.report.updateMany({
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

    // Update class positions for all students
    await updateClassPositions(schoolId, classId, termId);

    return { released: result.count };
  } catch (error) {
    logger.error("Bulk release reports error:", error);
    throw error;
  }
};

// ── Helper: Update class positions ────────────────────────────
const updateClassPositions = async (schoolId, classId, termId) => {
  try {
    // Get all students in the class with their aggregates
    const reports = await prisma.report.findMany({
      where: {
        student: {
          schoolId,
          enrollments: {
            some: { classId, termId }
          }
        },
        termId,
        status: "RELEASED"
      },
      select: {
        studentId: true,
        aggregate: true
      },
      orderBy: {
        aggregate: 'desc'
      }
    });

    // Update positions
    for (let i = 0; i < reports.length; i++) {
      await prisma.report.update({
        where: { 
          studentId_termId: { 
            studentId: reports[i].studentId, 
            termId 
          } 
        },
        data: {
          classPosition: i + 1,
          totalStudents: reports.length
        }
      });
    }

    return { updated: reports.length };
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

// ── Download class ZIP ─────────────────────────────────────────
const getClassZIPPath = async (schoolId, classId, termId) => {
  try {
    if (!classId || !termId) {
      throw createError("Class ID and Term ID are required.", 400);
    }

    const { generateClassZIP } = require("./pdf.service");
    return generateClassZIP(schoolId, classId, termId);
  } catch (error) {
    logger.error("Get class ZIP error:", error);
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
  generateReports,
  getReports,
  getReport,
  previewReport,
  regeneratePDF,
  updateRemarks,
  approveReport,
  releaseReport,
  bulkReleaseReports,
  emailReports,
  getClassZIPPath,
  getReportStats,
  sendSingleReportEmail,
};