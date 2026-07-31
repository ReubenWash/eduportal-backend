const enrollmentService = require("../services/enrollment.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");

const enroll = async (req, res) => {
  try {
    const { studentId, classId, termId } = req.body;
    
    // Validate input
    if (!studentId || !classId || !termId) {
      throw createError("studentId, classId, and termId are required", 400);
    }

    console.log('[Enrollment] Enrolling student:', { studentId, classId, termId, schoolId: req.user.schoolId });

    const enrollment = await enrollmentService.enroll(req.user.schoolId, {
      studentId,
      classId,
      termId
    });

    return sendSuccess(res, 201, "Student enrolled successfully.", enrollment);
  } catch (error) {
    console.error('[Enrollment] Enroll error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to enroll student'
    });
  }
};

const bulkEnroll = async (req, res) => {
  try {
    const { studentIds, classId, termId } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      throw createError("studentIds array is required", 400);
    }

    if (!classId || !termId) {
      throw createError("classId and termId are required", 400);
    }

    console.log('[Enrollment] Bulk enrolling students:', { 
      count: studentIds.length, 
      classId, 
      termId, 
      schoolId: req.user.schoolId 
    });

    const result = await enrollmentService.bulkEnroll(req.user.schoolId, {
      studentIds,
      classId,
      termId
    });

    return sendSuccess(res, 200, "Bulk enrollment complete.", result);
  } catch (error) {
    console.error('[Enrollment] Bulk enroll error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to bulk enroll students'
    });
  }
};

const list = async (req, res) => {
  try {
    const enrollments = await enrollmentService.getEnrollments(req.user.schoolId, req.query);
    return sendSuccess(res, 200, "Enrollments fetched.", enrollments);
  } catch (error) {
    console.error('[Enrollment] List error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch enrollments'
    });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw createError("Enrollment ID is required", 400);
    }

    console.log('[Enrollment] Removing enrollment:', { id, schoolId: req.user.schoolId });

    await enrollmentService.removeEnrollment(req.user.schoolId, id);
    return sendSuccess(res, 200, "Enrollment removed successfully.");
  } catch (error) {
    console.error('[Enrollment] Remove error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove enrollment'
    });
  }
};

module.exports = { enroll, bulkEnroll, list, remove };