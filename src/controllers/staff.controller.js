const staffService    = require("../services/staff.service");
const { sendSuccess } = require("../utils/apiResponse");

const create           = async (req, res) => { const photoUrl = req.file?.path || null; const s = await staffService.createStaff(req.user.schoolId, req.body, photoUrl); return sendSuccess(res, 201, "Staff created.", s); };
const list             = async (req, res) => { const r = await staffService.getStaff(req.user.schoolId, req.query); return sendSuccess(res, 200, "Staff fetched.", r); };
const getOne           = async (req, res) => { const s = await staffService.getStaffById(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Staff fetched.", s); };
const update           = async (req, res) => { const photoUrl = req.file?.path || null; const s = await staffService.updateStaff(req.user.schoolId, req.params.id, req.body, photoUrl); return sendSuccess(res, 200, "Staff updated.", s); };
const deactivate       = async (req, res) => { await staffService.deactivateStaff(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Staff deactivated."); };
const assignSubject    = async (req, res) => { const r = await staffService.assignSubject(req.user.schoolId, req.params.id, req.body.subjectId, req.body.classId); return sendSuccess(res, 200, "Subject assigned.", r); };
const removeAssignment = async (req, res) => { await staffService.removeAssignment(req.user.schoolId, req.params.id, req.body.subjectId, req.body.classId); return sendSuccess(res, 200, "Assignment removed."); };

module.exports = { create, list, getOne, update, deactivate, assignSubject, removeAssignment };
