const analyticsService = require("../../services/admin/platformAnalytics.service");
const { sendSuccess } = require("../../utils/apiResponse");

// GET /api/v1/admin/analytics
const getDashboard = async (req, res) => {
  const data = await analyticsService.getPlatformAnalytics();
  return sendSuccess(res, 200, "Platform analytics fetched.", data);
};

module.exports = { getDashboard, get: getDashboard };
