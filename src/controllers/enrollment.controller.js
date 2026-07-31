const enrollmentService = require("../services/enrollment.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");

const enroll = async (req, res) => {
  try {
    const { studentId, classId, termId } = req.body;
    const { schoolId } = req.user;

    console.log('[Enrollment Controller] Enroll request:', { 
      studentId, 
      classId, 
      termId, 
      schoolId,
      body: req.body 
    });

    // Validate input
    if (!studentId || !classId || !termId) {
      console.log('[Enrollment Controller] Missing required fields');
      return res.status(400).json({
        success: false,
        message: "studentId, classId, and termId are required",
        errors: [
          { param: 'studentId', msg: 'Student ID is required' },
          { param: 'classId', msg: 'Class ID is required' },
          { param: 'termId', msg: 'Term ID is required' }
        ]
      });
    }

    const enrollment = await enrollmentService.enroll(schoolId, {
      studentId,
      classId,
      termId
    });

    console.log('[Enrollment Controller] Enrollment successful:', enrollment.id);

    return sendSuccess(res, 201, "Student enrolled successfully.", enrollment);
  } catch (error) {
    console.error('[Enrollment Controller] Enroll error:', error);
    
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
    const { schoolId } = req.user;

    console.log('[Enrollment Controller] Bulk enroll request:', { 
      count: studentIds?.length, 
      classId, 
      termId, 
      schoolId 
    });

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "studentIds array is required"
      });
    }

    if (!classId || !termId) {
      return res.status(400).json({
        success: false,
        message: "classId and termId are required"
      });
    }

    const result = await enrollmentService.bulkEnroll(schoolId, {
      studentIds,
      classId,
      termId
    });

    console.log('[Enrollment Controller] Bulk enroll complete:', result);

    return sendSuccess(res, 200, "Bulk enrollment complete.", result);
  } catch (error) {
    console.error('[Enrollment Controller] Bulk enroll error:', error);
    
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
    const { schoolId } = req.user;
    console.log('[Enrollment Controller] List request:', { schoolId, query: req.query });

    const enrollments = await enrollmentService.getEnrollments(schoolId, req.query);
    return sendSuccess(res, 200, "Enrollments fetched.", enrollments);
  } catch (error) {
    console.error('[Enrollment Controller] List error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch enrollments'
    });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    console.log('[Enrollment Controller] Remove request:', { id, schoolId });

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Enrollment ID is required"
      });
    }

    await enrollmentService.removeEnrollment(schoolId, id);
    return sendSuccess(res, 200, "Enrollment removed successfully.");
  } catch (error) {
    console.error('[Enrollment Controller] Remove error:', error);
    
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