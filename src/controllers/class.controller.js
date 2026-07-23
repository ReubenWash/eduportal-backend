const classService    = require("../services/class.service");
const { sendSuccess } = require("../utils/apiResponse");

const create          = async (req, res) => { const c = await classService.createClass(req.user.schoolId, req.body); return sendSuccess(res, 201, "Class created.", c); };
const list            = async (req, res) => { const r = await classService.getClasses(req.user.schoolId, req.query); return sendSuccess(res, 200, "Classes fetched.", r); };
const getOne          = async (req, res) => { const c = await classService.getClassById(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Class fetched.", c); };
const update          = async (req, res) => { const c = await classService.updateClass(req.user.schoolId, req.params.id, req.body); return sendSuccess(res, 200, "Class updated.", c); };
const remove          = async (req, res) => { await classService.deleteClass(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Class deleted."); };
const assignSubject   = async (req, res) => { const r = await classService.assignSubjectToClass(req.user.schoolId, req.params.id, req.body.subjectId); return sendSuccess(res, 200, "Subject assigned.", r); };
const removeSubject   = async (req, res) => { await classService.removeSubjectFromClass(req.user.schoolId, req.params.id, req.params.subjectId); return sendSuccess(res, 200, "Subject removed."); };

module.exports = { create, list, getOne, update, remove, assignSubject, removeSubject };
