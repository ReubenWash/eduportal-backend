const { prisma } = require("../config/db");
const studentService  = require("../services/student.service");
const { sendSuccess, sendError } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { uploadStudentPhoto } = require("../middleware/upload");
const { parseExcelBuffer, generateExcelBuffer, sendExcelFile } = require("../utils/excel");

const admit = async (req, res) => {
  const photoUrl = req.file?.path || null;
  const student  = await studentService.admitStudent(req.user.schoolId, req.body, photoUrl);
  return sendSuccess(res, 201, "Student admitted successfully.", student);
};

const list = async (req, res) => {
  const result = await studentService.getStudents(req.user.schoolId, req.query);
  return sendSuccess(res, 200, "Students fetched.", result);
};

const getOne = async (req, res) => {
  const student = await studentService.getStudentById(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Student fetched.", student);
};

const update = async (req, res) => {
  const photoUrl = req.file?.path || null;
  const student  = await studentService.updateStudent(req.user.schoolId, req.params.id, req.body, photoUrl);
  return sendSuccess(res, 200, "Student updated.", student);
};

const withdraw = async (req, res) => {
  await studentService.withdrawStudent(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Student withdrawn.");
};

const transfer = async (req, res) => {
  const student = await studentService.transferStudent(req.user.schoolId, req.params.id, req.body.destinationSchool);
  return sendSuccess(res, 200, "Student transferred.", student);
};

const bulkImport = async (req, res) => {
  const result = await studentService.bulkImportStudents(req.user.schoolId, req.body.records || []);
  return sendSuccess(res, 200, "Bulk import complete.", result);
};

const getReports = async (req, res) => {
  const reports = await studentService.getStudentReports(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Reports fetched.", reports);
};

const getTranscript = async (req, res) => {
  const transcript = await studentService.getStudentTranscript(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Transcript fetched.", transcript);
};

// ── Self-service (STUDENT role) ─────────────────────────────────
// ✅ FIX: Student has no `email` field, and lookup must be scoped to
// this student's own record via the userId embedded in their JWT —
// never trust anything from req.params for "my own" data.
const getMe = async (req, res, next) => {
  try {
    const student = await prisma.student.findFirst({
      where: { userId: req.user.userId, schoolId: req.user.schoolId },
      include: {
        enrollments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { class: true }
        },
        guardians: {
          include: { guardian: true }
        }
      }
    });

    if (!student) return sendError(res, 404, "Student profile not found.");
    sendSuccess(res, 200, "Success", student);
  } catch (error) {
    next(error);
  }
};

const getMyReportCards = async (req, res, next) => {
  try {
    const student = await prisma.student.findFirst({ where: { userId: req.user.userId, schoolId: req.user.schoolId } });
    if (!student) return sendError(res, 404, "Student profile not found.");

    const reports = await prisma.report.findMany({
      where: { studentId: student.id, status: "RELEASED" },
      include: { term: true },
      orderBy: { createdAt: 'desc' }
    });
    sendSuccess(res, 200, "Success", reports);
  } catch (error) {
    next(error);
  }
};

const getMyGrades = async (req, res, next) => {
  try {
    const student = await prisma.student.findFirst({ where: { userId: req.user.userId, schoolId: req.user.schoolId } });
    if (!student) return sendError(res, 404, "Student profile not found.");

    const scores = await prisma.score.findMany({
      where: { studentId: student.id },
      include: { subject: true, term: true }
    });
    sendSuccess(res, 200, "Success", scores);
  } catch (error) {
    next(error);
  }
};

// ── Excel import/export ─────────────────────────────────────────
const importExcel = async (req, res) => {
  if (!req.file) throw createError("No file uploaded. Expected a .xlsx file under field name 'file'.", 422);
  const rows = await parseExcelBuffer(req.file.buffer);
  const result = await studentService.bulkImportStudentsFromExcelRows(req.user.schoolId, rows);
  return sendSuccess(res, 200, "Excel import completed.", result);
};

const exportExcel = async (req, res) => {
  const rows = await studentService.getStudentsForExport(req.user.schoolId, req.query);
  const buffer = await generateExcelBuffer({
    sheetName: "Students",
    columns: [
      { header: "Student No.", key: "studentNumber", width: 18 },
      { header: "First Name", key: "firstName", width: 18 },
      { header: "Last Name", key: "lastName", width: 18 },
      { header: "Other Names", key: "otherNames", width: 16 },
      { header: "Gender", key: "gender", width: 10 },
      { header: "Date of Birth", key: "dateOfBirth", width: 14 },
      { header: "Class", key: "class", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Admission Date", key: "admissionDate", width: 16 },
    ],
    rows,
  });
  sendExcelFile(res, buffer, `students-export-${Date.now()}.xlsx`);
};

module.exports = { admit, list, getOne, update, withdraw, transfer, bulkImport, getReports, getTranscript, getMe, getMyReportCards, getMyGrades, importExcel, exportExcel };