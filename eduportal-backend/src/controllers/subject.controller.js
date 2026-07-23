const subjectService  = require("../services/subject.service");
const { sendSuccess } = require("../utils/apiResponse");

const create = async (req, res) => { const s = await subjectService.createSubject(req.user.schoolId, req.body); return sendSuccess(res, 201, "Subject created.", s); };
const list   = async (req, res) => { const r = await subjectService.getSubjects(req.user.schoolId, req.query); return sendSuccess(res, 200, "Subjects fetched.", r); };
const update = async (req, res) => { const s = await subjectService.updateSubject(req.user.schoolId, req.params.id, req.body); return sendSuccess(res, 200, "Subject updated.", s); };
const remove = async (req, res) => { await subjectService.deleteSubject(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Subject deleted."); };

module.exports = { create, list, update, remove };
