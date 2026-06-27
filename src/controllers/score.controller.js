const scoreService    = require("../services/score.service");
const { sendSuccess } = require("../utils/apiResponse");

const submit   = async (req, res) => { const s = await scoreService.submitScore(req.user.schoolId, req.body); return sendSuccess(res, 200, "Score submitted.", s); };
const list     = async (req, res) => { const s = await scoreService.getScores(req.user.schoolId, req.query); return sendSuccess(res, 200, "Scores fetched.", s); };
const update   = async (req, res) => { const s = await scoreService.updateScore(req.user.schoolId, req.params.id, req.body); return sendSuccess(res, 200, "Score updated.", s); };
const compute  = async (req, res) => { const r = await scoreService.computeClassGrades(req.user.schoolId, req.body.classId, req.body.termId); return sendSuccess(res, 200, "Grades computed.", r); };
const summary  = async (req, res) => { const r = await scoreService.getClassSummary(req.user.schoolId, req.query.classId, req.query.termId); return sendSuccess(res, 200, "Class summary fetched.", r); };
const subStatus= async (req, res) => { const r = await scoreService.getSubmissionStatus(req.user.schoolId, req.query.classId, req.query.termId); return sendSuccess(res, 200, "Submission status fetched.", r); };

module.exports = { submit, list, update, compute, summary, subStatus };
