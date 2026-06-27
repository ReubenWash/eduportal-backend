const guardianService = require("../services/guardian.service");
const { sendSuccess } = require("../utils/apiResponse");

const create    = async (req, res) => { const g = await guardianService.createGuardian(req.user.schoolId, req.body); return sendSuccess(res, 201, "Guardian created.", g); };
const list      = async (req, res) => { const r = await guardianService.getGuardians(req.user.schoolId, req.query); return sendSuccess(res, 200, "Guardians fetched.", r); };
const getOne    = async (req, res) => { const g = await guardianService.getGuardianById(req.user.schoolId, req.params.id); return sendSuccess(res, 200, "Guardian fetched.", g); };
const update    = async (req, res) => { const g = await guardianService.updateGuardian(req.user.schoolId, req.params.id, req.body); return sendSuccess(res, 200, "Guardian updated.", g); };
const linkStudent = async (req, res) => { const r = await guardianService.linkToStudent(req.user.schoolId, req.params.id, req.body.studentId, req.body.isPrimary); return sendSuccess(res, 200, "Linked to student.", r); };

module.exports = { create, list, getOne, update, linkStudent };
