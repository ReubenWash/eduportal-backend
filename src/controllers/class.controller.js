const classService    = require("../services/class.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");

// ─── Create Class ───
const create = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log(`[ClassController] Creating class for school ${req.user.schoolId}:`, req.body);
    
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
      message: error.message || 'Failed to create class'
    });
  }
};

// ─── List Classes ───
const list = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log(`[ClassController] Fetching classes for school ${req.user.schoolId}`);
    
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
      message: error.message || 'Failed to fetch classes'
    });
  }
};

// ─── Get One Class ───
const getOne = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log(`[ClassController] Fetching class ${req.params.id} for school ${req.user.schoolId}`);
    
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
      message: error.message || 'Failed to fetch class'
    });
  }
};

// ─── Update Class ───
const update = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log(`[ClassController] Updating class ${req.params.id} for school ${req.user.schoolId}:`, req.body);
    
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
      message: error.message || 'Failed to update class'
    });
  }
};

// ─── Delete Class ───
const remove = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log(`[ClassController] Deleting class ${req.params.id} for school ${req.user.schoolId}`);
    
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
      message: error.message || 'Failed to delete class'
    });
  }
};

// ─── Assign Subject to Class ───
const assignSubject = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    if (!req.body.subjectId) {
      throw createError("Subject ID is required", 400);
    }
    
    console.log(`[ClassController] Assigning subject ${req.body.subjectId} to class ${req.params.id}`);
    
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
      message: error.message || 'Failed to assign subject'
    });
  }
};

// ─── Remove Subject from Class ───
const removeSubject = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    console.log(`[ClassController] Removing subject ${req.params.subjectId} from class ${req.params.id}`);
    
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
      message: error.message || 'Failed to remove subject'
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