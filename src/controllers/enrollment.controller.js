const enrollmentService = require("../services/enrollment.service");
const { sendSuccess }   = require("../utils/apiResponse");

const enroll     = async (req, res) => { const e = await enrollmentService.enroll(req.user.schoolId, req.body); return sendSuccess(res, 201, "Student enrolled.", e); };
const bulkEnroll = async (req, res) => { const r = await enrollmentService.bulkEnroll(req.user.schoolId, req.body); return sendSuccess(res, 200, "Bulk enrollment complete.", r); };
const list       = async (req, res) => { const r = await enrollmentService.getEnrollments(req.user.schoolId, req.query); return sendSuccess(res, 200, "Enrollments fetched.", r); };
const remove     = async (req, res) => { await enrollmentService.removeEnrollment(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Enrollment removed."); };

module.exports = { enroll, bulkEnroll, list, remove };
