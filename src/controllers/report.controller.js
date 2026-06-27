const reportService   = require("../services/report.service");
const { sendSuccess } = require("../utils/apiResponse");
const path = require("path");
const fs   = require("fs");

// POST /api/v1/reports/generate
const generate = async (req, res) => {
  const result = await reportService.generateReports(req.user.schoolId, req.body);
  return sendSuccess(res, 201, "Reports generated and queued for PDF rendering.", result);
};

// GET /api/v1/reports/:id
const getOne = async (req, res) => {
  const report = await reportService.getReport(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Report fetched.", report);
};

// GET /api/v1/reports/:id/preview
const preview = async (req, res) => {
  const html = await reportService.previewReport(req.user.schoolId, req.params.id);
  res.setHeader("Content-Type", "text/html");
  return res.send(html);
};

// POST /api/v1/reports/:id/regenerate-pdf
const regeneratePDF = async (req, res) => {
  const result = await reportService.regeneratePDF(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "PDF regenerated.", result);
};

// PATCH /api/v1/reports/:id/remarks
const updateRemarks = async (req, res) => {
  const report = await reportService.updateRemarks(req.user.schoolId, req.params.id, req.body);
  return sendSuccess(res, 200, "Remarks updated.", report);
};

// POST /api/v1/reports/:id/approve
const approve = async (req, res) => {
  const report = await reportService.approveReport(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Report approved.", report);
};

// POST /api/v1/reports/:id/release
const release = async (req, res) => {
  const report = await reportService.releaseReport(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Report released to students and parents.", report);
};

// POST /api/v1/reports/release-bulk
const bulkRelease = async (req, res) => {
  const result = await reportService.bulkReleaseReports(req.user.schoolId, req.body.classId, req.body.termId);
  return sendSuccess(res, 200, "Reports bulk released.", result);
};

// POST /api/v1/reports/email
const emailReports = async (req, res) => {
  const result = await reportService.emailReports(req.user.schoolId, req.body);
  return sendSuccess(res, 200, "Report emails dispatched.", result);
};

// GET /api/v1/reports/class/:classId/term/:termId
const downloadClassZIP = async (req, res) => {
  const { classId, termId } = req.params;
  const zipPath = await reportService.getClassZIPPath(req.user.schoolId, classId, termId);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="reports_${classId}_${termId}.zip"`);

  const stream = fs.createReadStream(zipPath);
  stream.pipe(res);

  // Clean up temp file after response
  stream.on("end", () => {
    fs.unlink(zipPath, () => {});
  });
  stream.on("error", () => {
    fs.unlink(zipPath, () => {});
    res.status(500).json({ success: false, message: "Failed to stream ZIP file." });
  });
};

module.exports = {
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
};
