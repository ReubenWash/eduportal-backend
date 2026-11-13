const { sendSuccess } = require("../utils/apiResponse");
const academicService = require("../services/portalAcademic.service");

const getClassTimetable = async (req, res, next) => {
  try {
    const data = await academicService.getClassTimetable(req.user, req.params.classId, req.query.termId);
    return sendSuccess(res, 200, "Class timetable fetched.", data);
  } catch (error) {
    return next(error);
  }
};

const getTeacherTimetable = async (req, res, next) => {
  try {
    const data = await academicService.getTeacherTimetable(req.user, req.query.termId);
    return sendSuccess(res, 200, "Teacher timetable fetched.", data);
  } catch (error) {
    return next(error);
  }
};

const saveTimetableSlot = async (req, res, next) => {
  try {
    const slot = await academicService.saveTimetableSlot(req.user, req.body);
    return sendSuccess(res, req.body.id ? 200 : 201, "Timetable slot saved.", slot);
  } catch (error) {
    return next(error);
  }
};

const listAssignments = async (req, res, next) => {
  try {
    const assignments = await academicService.listAssignments(req.user, req.query);
    return sendSuccess(res, 200, "Assignments fetched.", assignments);
  } catch (error) {
    return next(error);
  }
};

const createAssignment = async (req, res, next) => {
  try {
    const assignment = await academicService.createAssignment(req.user, req.body);
    return sendSuccess(res, 201, "Assignment created.", assignment);
  } catch (error) {
    return next(error);
  }
};

const getAssignmentSubmissions = async (req, res, next) => {
  try {
    const submissions = await academicService.getAssignmentSubmissions(req.user, req.params.id);
    return sendSuccess(res, 200, "Assignment submissions fetched.", submissions);
  } catch (error) {
    return next(error);
  }
};

const submitAssignment = async (req, res, next) => {
  try {
    const submission = await academicService.submitAssignment(req.user, req.params.id, req.body);
    return sendSuccess(res, 200, "Assignment submitted.", submission);
  } catch (error) {
    return next(error);
  }
};

const gradeSubmission = async (req, res, next) => {
  try {
    const submission = await academicService.gradeSubmission(req.user, req.params.submissionId, req.body);
    return sendSuccess(res, 200, "Submission graded.", submission);
  } catch (error) {
    return next(error);
  }
};

const getChildAssignments = async (req, res, next) => {
  try {
    const assignments = await academicService.getChildAssignments(req.user, req.params.studentId);
    return sendSuccess(res, 200, "Child assignments fetched.", assignments);
  } catch (error) {
    return next(error);
  }
};

const getChildTimetable = async (req, res, next) => {
  try {
    const timetable = await academicService.getChildTimetable(req.user, req.params.studentId);
    return sendSuccess(res, 200, "Child timetable fetched.", timetable);
  } catch (error) {
    return next(error);
  }
};

const getChildTeacherContact = async (req, res, next) => {
  try {
    const contact = await academicService.getChildTeacherContact(req.user, req.params.studentId);
    return sendSuccess(res, 200, "Teacher contact fetched.", contact);
  } catch (error) {
    return next(error);
  }
};

const getChildConductLog = async (req, res, next) => {
  try {
    const records = await academicService.getChildConductLog(req.user, req.params.studentId);
    return sendSuccess(res, 200, "Conduct records fetched.", records);
  } catch (error) {
    return next(error);
  }
};

const listConductIncidents = async (req, res, next) => {
  try {
    const records = await academicService.listConductIncidents(req.user, req.query);
    return sendSuccess(res, 200, "Conduct incidents fetched.", records);
  } catch (error) {
    return next(error);
  }
};

const createConductIncident = async (req, res, next) => {
  try {
    const incident = await academicService.createConductIncident(req.user, req.body);
    return sendSuccess(res, 201, "Conduct record created.", incident);
  } catch (error) {
    return next(error);
  }
};

const updateConductIncident = async (req, res, next) => {
  try {
    const incident = await academicService.updateConductIncident(req.user, req.params.id, req.body);
    return sendSuccess(res, 200, "Conduct record updated.", incident);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getClassTimetable,
  getTeacherTimetable,
  saveTimetableSlot,
  listAssignments,
  createAssignment,
  getAssignmentSubmissions,
  submitAssignment,
  gradeSubmission,
  getChildAssignments,
  getChildTimetable,
  getChildTeacherContact,
  getChildConductLog,
  listConductIncidents,
  createConductIncident,
  updateConductIncident,
};
