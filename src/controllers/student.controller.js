const studentService  = require("../services/student.service");
const { sendSuccess } = require("../utils/apiResponse");
const { uploadStudentPhoto } = require("../middleware/upload");

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
  // Expects req.csvData to be parsed records (handled by middleware or service)
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

module.exports = { admit, list, getOne, update, withdraw, transfer, bulkImport, getReports, getTranscript };
