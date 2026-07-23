const scoreService    = require("../services/score.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { parseExcelBuffer, generateExcelBuffer, sendExcelFile } = require("../utils/excel");

const submit    = async (req, res) => { const s = await scoreService.submitScore(req.user.schoolId, req.body); return sendSuccess(res, 200, "Score submitted.", s); };
const list      = async (req, res) => { const s = await scoreService.getScores(req.user.schoolId, req.query); return sendSuccess(res, 200, "Scores fetched.", s); };
const update    = async (req, res) => { const s = await scoreService.updateScore(req.user.schoolId, req.params.id, req.body); return sendSuccess(res, 200, "Score updated.", s); };
const compute   = async (req, res) => { const r = await scoreService.computeClassGrades(req.user.schoolId, req.body.classId, req.body.termId); return sendSuccess(res, 200, "Grades computed.", r); };
const summary   = async (req, res) => { const r = await scoreService.getClassSummary(req.user.schoolId, req.query.classId, req.query.termId); return sendSuccess(res, 200, "Class summary fetched.", r); };
const subStatus = async (req, res) => { const r = await scoreService.getSubmissionStatus(req.user.schoolId, req.query.classId, req.query.termId); return sendSuccess(res, 200, "Submission status fetched.", r); };

const downloadTemplate = async (req, res) => {
  const { classId, subjectId, termId } = req.query;
  if (!classId || !subjectId || !termId) throw createError("classId, subjectId, and termId query params are required.", 422);

  const rows = await scoreService.getScoreTemplateData(req.user.schoolId, { classId, subjectId, termId });
  const buffer = await generateExcelBuffer({
    sheetName: "Score Entry",
    columns: [
      { header: "studentId", key: "studentId", width: 4 },
      { header: "Student No.", key: "studentNumber", width: 16 },
      { header: "Student Name", key: "studentName", width: 24 },
      { header: "CA1 (/10)", key: "ca1", width: 12 },
      { header: "CA2 (/10)", key: "ca2", width: 12 },
      { header: "CA3 (/10)", key: "ca3", width: 12 },
      { header: "Exam (/100)", key: "examScore", width: 14 },
    ],
    rows,
  });
  sendExcelFile(res, buffer, `score-template-${Date.now()}.xlsx`);
};

const importExcel = async (req, res) => {
  if (!req.file) throw createError("No file uploaded. Expected a .xlsx file under field name 'file'.", 422);
  const { subjectId, termId } = req.query;
  if (!subjectId || !termId) throw createError("subjectId and termId query params are required.", 422);

  const rows = await parseExcelBuffer(req.file.buffer);
  const result = await scoreService.bulkImportScoresFromExcelRows(req.user.schoolId, subjectId, termId, rows);
  return sendSuccess(res, 200, "Scores imported from Excel.", result);
};

module.exports = { submit, list, update, compute, summary, subStatus, downloadTemplate, importExcel };