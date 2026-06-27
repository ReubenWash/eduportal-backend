const schoolService = require("../services/school.service");
const { sendSuccess } = require("../utils/apiResponse");
const { uploadSchoolLogo } = require("../middleware/upload");

// POST /api/v1/schools/register
const register = async (req, res) => {
  const school = await schoolService.registerSchool(req.body);
  return sendSuccess(res, 201, "School registered. Please check your email to verify your account.", school);
};

// GET /api/v1/schools/me
const getProfile = async (req, res) => {
  const school = await schoolService.getSchoolProfile(req.user.schoolId);
  return sendSuccess(res, 200, "School profile fetched.", school);
};

// PATCH /api/v1/schools/me
const updateProfile = async (req, res) => {
  // Handle logo upload via middleware before this controller runs
  const logoUrl = req.file?.path || null;
  const school  = await schoolService.updateSchoolProfile(req.user.schoolId, req.body, logoUrl);
  return sendSuccess(res, 200, "School profile updated.", school);
};

// GET /api/v1/schools/me/dashboard
const getDashboard = async (req, res) => {
  const stats = await schoolService.getDashboardStats(req.user.schoolId);
  return sendSuccess(res, 200, "Dashboard stats fetched.", stats);
};

// GET /api/v1/schools/me/terms
const getTerms = async (req, res) => {
  const terms = await schoolService.getTerms(req.user.schoolId, req.query.academicYear);
  return sendSuccess(res, 200, "Terms fetched.", terms);
};

// POST /api/v1/schools/me/terms
const createTerm = async (req, res) => {
  const term = await schoolService.createTerm(req.user.schoolId, req.body);
  return sendSuccess(res, 201, "Term created.", term);
};

// PATCH /api/v1/schools/me/terms/:id
const updateTerm = async (req, res) => {
  const term = await schoolService.updateTerm(req.user.schoolId, req.params.id, req.body);
  return sendSuccess(res, 200, "Term updated.", term);
};

// GET /api/v1/schools  (SUPER_ADMIN)
const getAllSchools = async (req, res) => {
  const result = await schoolService.getAllSchools(req.query);
  return sendSuccess(res, 200, "Schools fetched.", result);
};

// PATCH /api/v1/schools/:id/status  (SUPER_ADMIN)
const updateStatus = async (req, res) => {
  const school = await schoolService.updateSchoolStatus(req.params.id, req.body.status);
  return sendSuccess(res, 200, "School status updated.", school);
};

module.exports = {
  register,
  getProfile,
  updateProfile,
  getDashboard,
  getTerms,
  createTerm,
  updateTerm,
  getAllSchools,
  updateStatus,
};
