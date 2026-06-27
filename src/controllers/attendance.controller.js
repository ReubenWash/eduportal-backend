const attendanceService = require("../services/attendance.service");
const { sendSuccess }   = require("../utils/apiResponse");

const mark       = async (req, res) => { const r = await attendanceService.markAttendance(req.user.schoolId, req.body); return sendSuccess(res, 200, "Attendance marked.", r); };
const bulkMark   = async (req, res) => { const r = await attendanceService.bulkMarkAttendance(req.user.schoolId, req.body); return sendSuccess(res, 200, "Attendance recorded.", r); };
const list       = async (req, res) => { const r = await attendanceService.getAttendance(req.user.schoolId, req.query); return sendSuccess(res, 200, "Attendance fetched.", r); };
const update     = async (req, res) => { const r = await attendanceService.updateAttendance(req.user.schoolId, req.params.id, req.body); return sendSuccess(res, 200, "Attendance updated.", r); };
const summary    = async (req, res) => { const r = await attendanceService.getAttendanceSummary(req.user.schoolId, req.query.classId, req.query.termId); return sendSuccess(res, 200, "Summary fetched.", r); };
const analytics  = async (req, res) => { const r = await attendanceService.getAttendanceAnalytics(req.user.schoolId, req.query.termId, req.query.classId); return sendSuccess(res, 200, "Analytics fetched.", r); };

module.exports = { mark, bulkMark, list, update, summary, analytics };
