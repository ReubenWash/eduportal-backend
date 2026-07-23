const staffService    = require("../services/staff.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { parseExcelBuffer, generateExcelBuffer, sendExcelFile } = require("../utils/excel");

const create           = async (req, res) => { const photoUrl = req.file?.path || null; const s = await staffService.createStaff(req.user.schoolId, req.body, photoUrl); return sendSuccess(res, 201, "Staff created.", s); };
const list             = async (req, res) => { const r = await staffService.getStaff(req.user.schoolId, req.query); return sendSuccess(res, 200, "Staff fetched.", r); };
const getOne            = async (req, res) => { const s = await staffService.getStaffById(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Staff fetched.", s); };
const update            = async (req, res) => { const photoUrl = req.file?.path || null; const s = await staffService.updateStaff(req.user.schoolId, req.params.id, req.body, photoUrl); return sendSuccess(res, 200, "Staff updated.", s); };
const deactivate        = async (req, res) => { await staffService.deactivateStaff(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Staff deactivated."); };
const assignSubject     = async (req, res) => { const r = await staffService.assignSubject(req.user.schoolId, req.params.id, req.body.subjectId, req.body.classId); return sendSuccess(res, 200, "Subject assigned.", r); };
const removeAssignment  = async (req, res) => { await staffService.removeAssignment(req.user.schoolId, req.params.id, req.body.subjectId, req.body.classId); return sendSuccess(res, 200, "Assignment removed."); };

const importExcel = async (req, res) => {
  if (!req.file) throw createError("No file uploaded. Expected a .xlsx file under field name 'file'.", 422);
  const rows = await parseExcelBuffer(req.file.buffer);
  const result = await staffService.bulkImportStaffFromExcelRows(req.user.schoolId, rows);
  return sendSuccess(res, 200, "Excel import completed.", result);
};

const exportExcel = async (req, res) => {
  const rows = await staffService.getStaffForExport(req.user.schoolId, req.query);
  const buffer = await generateExcelBuffer({
    sheetName: "Staff",
    columns: [
      { header: "Staff No.", key: "staffNumber", width: 16 },
      { header: "First Name", key: "firstName", width: 18 },
      { header: "Last Name", key: "lastName", width: 18 },
      { header: "Email", key: "email", width: 26 },
      { header: "Role", key: "role", width: 18 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Qualification", key: "qualification", width: 20 },
    ],
    rows,
  });
  sendExcelFile(res, buffer, `staff-export-${Date.now()}.xlsx`);
};

module.exports = { create, list, getOne, update, deactivate, assignSubject, removeAssignment, importExcel, exportExcel };