const classService    = require("../services/class.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");

// ─── Create Class ───
const create = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      throw createError("User not authenticated", 401);
    }
    
    // Check if schoolId exists
    if (!req.user.schoolId) {
      console.error('[ClassController] No schoolId in user:', req.user);
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log('[ClassController] Creating class for school:', req.user.schoolId);
    console.log('[ClassController] Request body:', req.body);
    
    // Validate required fields
    const { level, section, academicYear } = req.body;
    if (!level || !section || !academicYear) {
      throw createError('Level, section, and academicYear are required', 400);
    }
    
    // Validate academic year format
    if (!/^\d{4}\/\d{4}$/.test(academicYear)) {
      throw createError('Academic year must be in YYYY/YYYY format (e.g., 2024/2025)', 400);
    }
    
    const c = await classService.createClass(req.user.schoolId, req.body);
    return sendSuccess(res, 201, "Class created successfully.", c);
  } catch (error) {
    console.error('[ClassController] Create error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create class',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ─── List Classes ───
const list = async (req, res) => {
  try {
    if (!req.user) {
      throw createError("User not authenticated", 401);
    }
    
    if (!req.user.schoolId) {
      console.error('[ClassController] No schoolId in user:', req.user);
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log('[ClassController] Fetching classes for school:', req.user.schoolId);
    
    const r = await classService.getClasses(req.user.schoolId, req.query);
    return sendSuccess(res, 200, "Classes fetched successfully.", r);
  } catch (error) {
    console.error('[ClassController] List error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch classes',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ─── Get One Class ───
const getOne = async (req, res) => {
  try {
    if (!req.user) {
      throw createError("User not authenticated", 401);
    }
    
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    const c = await classService.getClassById(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Class fetched successfully.", c);
  } catch (error) {
    console.error('[ClassController] GetOne error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch class',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ─── Update Class ───
const update = async (req, res) => {
  try {
    if (!req.user) {
      throw createError("User not authenticated", 401);
    }
    
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log('[ClassController] Updating class:', req.params.id);
    console.log('[ClassController] Update data:', req.body);
    
    const c = await classService.updateClass(req.user.schoolId, req.params.id, req.body);
    return sendSuccess(res, 200, "Class updated successfully.", c);
  } catch (error) {
    console.error('[ClassController] Update error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update class',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ─── Delete Class ───
const remove = async (req, res) => {
  try {
    if (!req.user) {
      throw createError("User not authenticated", 401);
    }
    
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log('[ClassController] Deleting class:', req.params.id);
    
    await classService.deleteClass(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Class deleted successfully.");
  } catch (error) {
    console.error('[ClassController] Delete error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete class',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ─── Assign Subject to Class ───
const assignSubject = async (req, res) => {
  try {
    if (!req.user) {
      throw createError("User not authenticated", 401);
    }
    
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    if (!req.body.subjectId) {
      throw createError("Subject ID is required", 400);
    }
    
    console.log('[ClassController] Assigning subject:', req.body.subjectId, 'to class:', req.params.id);
    
    const r = await classService.assignSubjectToClass(req.user.schoolId, req.params.id, req.body.subjectId);
    return sendSuccess(res, 200, "Subject assigned successfully.", r);
  } catch (error) {
    console.error('[ClassController] AssignSubject error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to assign subject',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ─── Remove Subject from Class ───
const removeSubject = async (req, res) => {
  try {
    if (!req.user) {
      throw createError("User not authenticated", 401);
    }
    
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log('[ClassController] Removing subject:', req.params.subjectId, 'from class:', req.params.id);
    
    await classService.removeSubjectFromClass(req.user.schoolId, req.params.id, req.params.subjectId);
    return sendSuccess(res, 200, "Subject removed successfully.");
  } catch (error) {
    console.error('[ClassController] RemoveSubject error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove subject',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

module.exports = { 
  create, 
  list, 
  getOne, 
  update, 
  remove, 
  assignSubject, 
  removeSubject 
};