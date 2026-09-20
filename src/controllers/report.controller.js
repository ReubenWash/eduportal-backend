const reportService   = require("../services/report.service");
const { buildReportPDF } = require("../services/pdf.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const fs   = require("fs");

// Shared error responder (same behaviour as the old inline catch blocks)
const handleError = (res, error, label, fallbackMessage) => {
  console.error(`${label}:`, error);
  if (res.headersSent) return;
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }
  return res.status(500).json({
    success: false,
    message: error.message || fallbackMessage
  });
};

// ─── POST /api/v1/reports/generate ───
const generate = async (req, res) => {
  try {
    const { termId, studentId, classId } = req.body;

    if (!termId) {
      throw createError("Term ID is required.", 400);
    }
    if (!studentId && !classId) {
      throw createError("Either studentId or classId is required.", 400);
    }

    const result = await reportService.generateReports(req.user.schoolId, req.body);
    return sendSuccess(res, 201, "Reports generated and queued for PDF rendering.", result);
  } catch (error) {
    return handleError(res, error, "Generate report error", "Failed to generate reports");
  }
};

// ─── GET /api/v1/reports ───
const list = async (req, res) => {
  try {
    const reports = await reportService.getReports(req.user.schoolId, req.query, req.user);
    return sendSuccess(res, 200, "Reports fetched successfully.", reports);
  } catch (error) {
    return handleError(res, error, "List reports error", "Failed to fetch reports");
  }
};

// ─── GET /api/v1/reports/my-classes ───
// Classes the current user can write report remarks for (admin: all, class teacher: own)
const myClasses = async (req, res) => {
  try {
    const classes = await reportService.getMyReportClasses(req.user);
    return sendSuccess(res, 200, "Classes fetched successfully.", classes);
  } catch (error) {
    return handleError(res, error, "My report classes error", "Failed to fetch classes");
  }
};

// ─── GET /api/v1/reports/:id ───
const getOne = async (req, res) => {
  try {
    await reportService.assertReportAccess(req.user, req.params.id);
    const report = await reportService.getReport(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Report fetched successfully.", report);
  } catch (error) {
    return handleError(res, error, "Get report error", "Failed to fetch report");
  }
};

// Renders the PDF on the server and sends it straight to the client.
// No request to Cloudinary is made, so this works even when Cloudinary
// blocks public delivery of PDFs (HTTP 401).
const sendPdf = async (res, reportId, filename, attachment = false) => {
  const { pdfBuffer } = await buildReportPDF(reportId);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${attachment ? "attachment" : "inline"}; filename="${filename}"`
  );
  res.setHeader("Content-Length", pdfBuffer.length);
  return res.end(pdfBuffer);
};

// ─── GET /api/v1/reports/:id/preview ───
const preview = async (req, res) => {
  try {
    // Admin: any report of the school. Class teacher: own class. Student/parent: own, released only.
    await reportService.assertReportAccess(req.user, req.params.id);
    return await sendPdf(res, req.params.id, `preview-${req.params.id}.pdf`, false);
  } catch (error) {
    return handleError(res, error, "Preview report error", "Failed to preview report");
  }
};

// ─── GET /api/v1/reports/:id/pdf ───
const downloadPDF = async (req, res) => {
  try {
    await reportService.assertReportAccess(req.user, req.params.id);
    return await sendPdf(res, req.params.id, `report-${req.params.id}.pdf`, true);
  } catch (error) {
    return handleError(res, error, "Download report PDF error", "Failed to download report PDF");
  }
};

// ─── POST /api/v1/reports/:id/regenerate-pdf ───
const regeneratePDF = async (req, res) => {
  try {
    const result = await reportService.regeneratePDF(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "PDF regenerated successfully.", result);
  } catch (error) {
    return handleError(res, error, "Regenerate PDF error", "Failed to regenerate PDF");
  }
};

// ─── PATCH /api/v1/reports/:id/remarks ───
const updateRemarks = async (req, res) => {
  try {
    const report = await reportService.updateRemarks(req.user, req.params.id, req.body);
    return sendSuccess(res, 200, "Remarks updated successfully.", report);
  } catch (error) {
    return handleError(res, error, "Update remarks error", "Failed to update remarks");
  }
};

// ─── POST /api/v1/reports/:id/approve ───
const approve = async (req, res) => {
  try {
    const report = await reportService.approveReport(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Report approved successfully.", report);
  } catch (error) {
    return handleError(res, error, "Approve report error", "Failed to approve report");
  }
};

// ─── POST /api/v1/reports/:id/release ───
const release = async (req, res) => {
  try {
    const report = await reportService.releaseReport(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Report released to students and parents successfully.", report);
  } catch (error) {
    return handleError(res, error, "Release report error", "Failed to release report");
  }
};

// ─── POST /api/v1/reports/release-bulk ───
const bulkRelease = async (req, res) => {
  try {
    const { classId, termId, ids } = req.body;

    if (Array.isArray(ids) && ids.length > 0) {
      const result = await reportService.bulkReleaseReportsByIds(req.user.schoolId, ids);
      return sendSuccess(res, 200, `${result.released} reports released successfully.`, result);
    }

    if (!classId || !termId) {
      throw createError("Class ID and Term ID are required.", 400);
    }

    const result = await reportService.bulkReleaseReports(req.user.schoolId, classId, termId);
    return sendSuccess(res, 200, `${result.released} reports released successfully.`, result);
  } catch (error) {
    return handleError(res, error, "Bulk release reports error", "Failed to bulk release reports");
  }
};

// ─── POST /api/v1/reports/email ───
const emailReports = async (req, res) => {
  try {
    const { termId, classId, studentId } = req.body;

    if (!termId) {
      throw createError("Term ID is required.", 400);
    }
    if (!studentId && !classId) {
      throw createError("Either studentId or classId is required.", 400);
    }

    const result = await reportService.emailReports(req.user.schoolId, req.body);
    return sendSuccess(res, 200, `Reports emailed: ${result.sent} sent, ${result.failed} failed.`, result);
  } catch (error) {
    return handleError(res, error, "Email reports error", "Failed to email reports");
  }
};

// ─── GET /api/v1/reports/class/:classId/term/:termId ───
const downloadClassZIP = async (req, res) => {
  try {
    const { classId, termId } = req.params;

    if (!classId || !termId) {
      throw createError("Class ID and Term ID are required.", 400);
    }

    const zipPath = await reportService.getClassZIPPath(req.user.schoolId, classId, termId);

    // Check if file exists
    if (!fs.existsSync(zipPath)) {
      throw createError("ZIP file not found.", 404);
    }

    const fileName = `reports_class_${classId}_term_${termId}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", fs.statSync(zipPath).size);

    const stream = fs.createReadStream(zipPath);
    stream.pipe(res);

    // Clean up temp file after response
    stream.on("end", () => {
      fs.unlink(zipPath, (err) => {
        if (err) console.error("Failed to delete temp ZIP:", err);
      });
    });
    stream.on("error", (err) => {
      console.error("Stream error:", err);
      fs.unlink(zipPath, () => {});
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Failed to stream ZIP file."
        });
      }
    });
  } catch (error) {
    return handleError(res, error, "Download class ZIP error", "Failed to download class ZIP");
  }
};

// ─── GET /api/v1/reports/stats ───
const getStats = async (req, res) => {
  try {
    const { termId } = req.query;

    if (!termId) {
      throw createError("Term ID is required.", 400);
    }

    const stats = await reportService.getReportStats(req.user.schoolId, termId);
    return sendSuccess(res, 200, "Report statistics fetched successfully.", stats);
  } catch (error) {
    return handleError(res, error, "Get report stats error", "Failed to fetch report statistics");
  }
};

// ─── GET /api/v1/reports/student/:studentId ───
const getStudentReports = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!studentId) {
      throw createError("Student ID is required.", 400);
    }

    const reports = await reportService.getReports(req.user.schoolId, { studentId }, req.user);
    return sendSuccess(res, 200, "Student reports fetched successfully.", reports);
  } catch (error) {
    return handleError(res, error, "Get student reports error", "Failed to fetch student reports");
  }
};

// ─── POST /api/v1/reports/generate-batch ───
const generateBatch = async (req, res) => {
  try {
    const { termId, classIds } = req.body;

    if (!termId) {
      throw createError("Term ID is required.", 400);
    }
    if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
      throw createError("At least one class ID is required.", 400);
    }

    const results = [];
    for (const classId of classIds) {
      const result = await reportService.generateReports(req.user.schoolId, { termId, classId });
      results.push({ classId, ...result });
    }

    return sendSuccess(res, 201, "Batch reports generated successfully.", results);
  } catch (error) {
    return handleError(res, error, "Batch generate reports error", "Failed to generate batch reports");
  }
};

module.exports = {
  myClasses,
  list,
  generate,
  getOne,
  preview,
  downloadPDF,
  regeneratePDF,
  updateRemarks,
  approve,
  release,
  bulkRelease,
  emailReports,
  downloadClassZIP,
  getStats,
  getStudentReports,
  generateBatch,
};