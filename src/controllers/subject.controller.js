// src/controllers/subject.controller.js
const subjectService = require("../services/subject.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");

const create = async (req, res) => {
  try {
    const subject = await subjectService.createSubject(req.user.schoolId, req.body);
    return sendSuccess(res, 201, "Subject created successfully.", subject);
  } catch (error) {
    console.error("❌ Create subject error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create subject",
    });
  }
};

const list = async (req, res) => {
  try {
    console.log(`📋 list subjects called, user:`, req.user?.id, req.user?.schoolId);
    const subjects = await subjectService.getSubjects(req.user?.schoolId, req.query);
    return sendSuccess(res, 200, "Subjects fetched successfully.", subjects);
  } catch (error) {
    console.error("❌ List subjects error:", error);
    // Check for specific error types
    if (error.code === "P2024" || error.code === "P1001") {
      return res.status(503).json({
        success: false,
        message: "Database connection error. Please try again later.",
      });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch subjects",
    });
  }
};

const getOne = async (req, res) => {
  try {
    const subject = await subjectService.getSubjectById(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Subject fetched successfully.", subject);
  } catch (error) {
    console.error("❌ Get subject error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch subject",
    });
  }
};

const update = async (req, res) => {
  try {
    const subject = await subjectService.updateSubject(req.user.schoolId, req.params.id, req.body);
    return sendSuccess(res, 200, "Subject updated successfully.", subject);
  } catch (error) {
    console.error("❌ Update subject error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A subject with this code already exists.",
      });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update subject",
    });
  }
};

const remove = async (req, res) => {
  try {
    await subjectService.deleteSubject(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Subject deleted successfully.");
  } catch (error) {
    console.error("❌ Delete subject error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete subject",
    });
  }
};

module.exports = { create, list, getOne, update, remove };