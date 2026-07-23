const analyticsService = require("../services/analytics.service");
const { sendSuccess }  = require("../utils/apiResponse");
const { createError }  = require("../middleware/errorHandler");

const performance = async (req, res) => {
  const data = await analyticsService.getSchoolPerformance(req.user.schoolId, req.query.termId);
  return sendSuccess(res, 200, "Performance data fetched.", data);
};

const subjects = async (req, res) => {
  const data = await analyticsService.getSubjectAnalysis(req.user.schoolId, req.query.termId, req.query.classId);
  return sendSuccess(res, 200, "Subject analysis fetched.", data);
};

const topStudents = async (req, res) => {
  const data = await analyticsService.getTopStudents(req.user.schoolId, req.query.termId, req.query.limit, req.query.classId);
  return sendSuccess(res, 200, "Top students fetched.", data);
};

const trends = async (req, res) => {
  const data = await analyticsService.getPerformanceTrends(req.user.schoolId, req.query.academicYear, req.query.classId);
  return sendSuccess(res, 200, "Trends fetched.", data);
};

const gender = async (req, res) => {
  const data = await analyticsService.getGenderPerformance(req.user.schoolId, req.query.termId, req.query.classId);
  return sendSuccess(res, 200, "Gender performance fetched.", data);
};

// GET /api/v1/analytics/export?type=class-summary&termId=xxx&format=excel
const exportData = async (req, res) => {
  const { type, termId, format = "excel" } = req.query;

  if (!type)   throw createError("Export type is required.", 400);
  if (!termId) throw createError("termId is required.", 400);
  if (!["excel", "csv"].includes(format)) throw createError("Format must be excel or csv.", 400);

  const result = await analyticsService.exportAnalytics(req.user.schoolId, { type, termId, format });

  if (format === "excel") {
    // Build Excel using a simple JSON-to-XLSX approach
    const ExcelJS = require("exceljs");
    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Export");

    if (result.data.length === 0) {
      return sendSuccess(res, 200, "No data to export.", []);
    }

    // Headers from first row keys
    const headers = Object.keys(result.data[0]);
    worksheet.addRow(headers);

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3C5E" } };
      cell.alignment = { horizontal: "center" };
      cell.border    = {
        top:    { style: "thin" }, bottom: { style: "thin" },
        left:   { style: "thin" }, right:  { style: "thin" },
      };
    });

    // Data rows
    result.data.forEach((row, idx) => {
      const dataRow = worksheet.addRow(Object.values(row));
      if (idx % 2 === 0) {
        dataRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF3FB" } };
        });
      }
    });

    // Auto-fit columns
    worksheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      col.width = maxLen + 4;
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    await workbook.xlsx.write(res);
    return res.end();
  }

  // CSV fallback
  const headers = Object.keys(result.data[0] || {});
  const csvRows = [
    headers.join(","),
    ...result.data.map((row) =>
      headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  return res.send(csvRows.join("\n"));
};

module.exports = { performance, subjects, topStudents, trends, gender, exportData };
