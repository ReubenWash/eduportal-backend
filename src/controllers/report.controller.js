const reportService   = require("../services/report.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const path = require("path");
const fs   = require("fs");

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
    console.error('Generate report error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate reports'
    });
  }
};

// ─── GET /api/v1/reports ───
const list = async (req, res) => {
  try {
    const reports = await reportService.getReports(req.user.schoolId, req.query);
    return sendSuccess(res, 200, "Reports fetched successfully.", reports);
  } catch (error) {
    console.error('List reports error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch reports'
    });
  }
};

// ─── GET /api/v1/reports/:id ───
const getOne = async (req, res) => {
  try {
    const report = await reportService.getReport(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Report fetched successfully.", report);
  } catch (error) {
    console.error('Get report error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch report'
    });
  }
};

// ─── GET /api/v1/reports/:id/preview ───
const preview = async (req, res) => {
  try {
    const html = await reportService.previewReport(req.user.schoolId, req.params.id);
    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (error) {
    console.error('Preview report error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to preview report'
    });
  }
};

// ─── POST /api/v1/reports/:id/regenerate-pdf ───
const regeneratePDF = async (req, res) => {
  try {
    const result = await reportService.regeneratePDF(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "PDF regenerated successfully.", result);
  } catch (error) {
    console.error('Regenerate PDF error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to regenerate PDF'
    });
  }
};

// ─── PATCH /api/v1/reports/:id/remarks ───
const updateRemarks = async (req, res) => {
  try {
    const { teacherRemark, headRemark } = req.body;
    
    if (teacherRemark === undefined && headRemark === undefined) {
      throw createError("At least one remark field is required.", 400);
    }

    const report = await reportService.updateRemarks(req.user.schoolId, req.params.id, req.body);
    return sendSuccess(res, 200, "Remarks updated successfully.", report);
  } catch (error) {
    console.error('Update remarks error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update remarks'
    });
  }
};

// ─── POST /api/v1/reports/:id/approve ───
const approve = async (req, res) => {
  try {
    const report = await reportService.approveReport(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Report approved successfully.", report);
  } catch (error) {
    console.error('Approve report error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve report'
    });
  }
};

// ─── POST /api/v1/reports/:id/release ───
const release = async (req, res) => {
  try {
    const report = await reportService.releaseReport(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Report released to students and parents successfully.", report);
  } catch (error) {
    console.error('Release report error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to release report'
    });
  }
};

// ─── POST /api/v1/reports/release-bulk ───
const bulkRelease = async (req, res) => {
  try {
    const { classId, termId } = req.body;
    
    if (!classId || !termId) {
      throw createError("Class ID and Term ID are required.", 400);
    }

    const result = await reportService.bulkReleaseReports(req.user.schoolId, classId, termId);
    return sendSuccess(res, 200, `${result.released} reports released successfully.`, result);
  } catch (error) {
    console.error('Bulk release reports error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to bulk release reports'
    });
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
    console.error('Email reports error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to email reports'
    });
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
    console.error('Download class ZIP error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to download class ZIP'
    });
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
    console.error('Get report stats error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch report statistics'
    });
  }
};

// ─── GET /api/v1/reports/student/:studentId ───
const getStudentReports = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!studentId) {
      throw createError("Student ID is required.", 400);
    }

    const reports = await reportService.getReports(req.user.schoolId, { studentId });
    return sendSuccess(res, 200, "Student reports fetched successfully.", reports);
  } catch (error) {
    console.error('Get student reports error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch student reports'
    });
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
    console.error('Batch generate reports error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate batch reports'
    });
  }
};

module.exports = {
  list,
  generate,
  getOne,
  preview,
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