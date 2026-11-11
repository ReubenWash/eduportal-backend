const { askStudyAssistant } = require("../services/studyAssistant.service");
const { sendError, sendSuccess } = require("../utils/apiResponse");
const logger = require("../config/logger");

const ask = async (req, res) => {
  try {
    const result = await askStudyAssistant(req.body.question);
    return sendSuccess(res, 200, "Study assistant response generated.", result);
  } catch (error) {
    if (error.isOperational) {
      return sendError(res, error.statusCode, error.message);
    }
    logger.error(`Study assistant request failed for user ${req.user.userId}: ${error.message}`);
    return sendError(res, 502, "The study assistant could not answer right now. Please try again later.");
  }
};

module.exports = { ask };
