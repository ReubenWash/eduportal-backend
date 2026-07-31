const staffService    = require("../services/staff.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { parseExcelBuffer, generateExcelBuffer, sendExcelFile } = require("../utils/excel");

// ─── Create Staff ───
const create = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const photoUrl = req.file?.path || null;
    const staff = await staffService.createStaff(req.user.schoolId, req.body, photoUrl);
    return sendSuccess(res, 201, "Staff created successfully.", staff);
  } catch (error) {
    console.error('Create staff error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create staff'
    });
  }
};

// ─── List Staff ───
const list = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const result = await staffService.getStaff(req.user.schoolId, req.query);
    return sendSuccess(res, 200, "Staff fetched successfully.", result);
  } catch (error) {
    console.error('List staff error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch staff'
    });
  }
};

// ─── Get One Staff ───
const getOne = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const staff = await staffService.getStaffById(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Staff fetched successfully.", staff);
  } catch (error) {
    console.error('Get one staff error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch staff'
    });
  }
};

// ─── Update Staff ───
const update = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const photoUrl = req.file?.path || null;
    const staff = await staffService.updateStaff(req.user.schoolId, req.params.id, req.body, photoUrl);
    return sendSuccess(res, 200, "Staff updated successfully.", staff);
  } catch (error) {
    console.error('Update staff error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update staff'
    });
  }
};

// ─── Deactivate Staff ───
const deactivate = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    await staffService.deactivateStaff(req.user.schoolId, req.params.id);
    return sendSuccess(res, 200, "Staff deactivated successfully.");
  } catch (error) {
    console.error('Deactivate staff error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to deactivate staff'
    });
  }
};

// ─── Assign Subject to Staff ───
const assignSubject = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const result = await staffService.assignSubject(
      req.user.schoolId, 
      req.params.id, 
      req.body.subjectId, 
      req.body.classId
    );
    return sendSuccess(res, 200, "Subject assigned successfully.", result);
  } catch (error) {
    console.error('Assign subject error:', error);
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

// ─── Remove Assignment from Staff ───
const removeAssignment = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    await staffService.removeAssignment(
      req.user.schoolId, 
      req.params.id, 
      req.body.subjectId, 
      req.body.classId
    );
    return sendSuccess(res, 200, "Assignment removed successfully.");
  } catch (error) {
    console.error('Remove assignment error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove assignment'
    });
  }
};

// ─── Import Staff from Excel ───
const importExcel = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    if (!req.file) {
      throw createError("No file uploaded. Expected a .xlsx file under field name 'file'.", 422);
    }
    const rows = await parseExcelBuffer(req.file.buffer);
    const result = await staffService.bulkImportStaffFromExcelRows(req.user.schoolId, rows);
    return sendSuccess(res, 200, "Excel import completed.", result);
  } catch (error) {
    console.error('Import Excel error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to import Excel'
    });
  }
};

// ─── Export Staff to Excel ───
const exportExcel = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const rows = await staffService.getStaffForExport(req.user.schoolId, req.query);
    const buffer = await generateExcelBuffer({
      sheetName: "Staff",
      columns: [
        { header: "Staff No.", key: "staffNumber", width: 16 },
        { header: "First Name", key: "firstName", width: 18 },
        { header: "Last Name", key: "lastName", width: 18 },
        { header: "Email", key: "email", width: 26 },
        { header: "Role", key: "role", width: 18 },
        { header: "Phone", key: "phone", width: 16 },
        { header: "Qualification", key: "qualification", width: 20 },
        { header: "Status", key: "isActive", width: 12 },
      ],
      rows,
    });
    sendExcelFile(res, buffer, `staff-export-${Date.now()}.xlsx`);
  } catch (error) {
    console.error('Export Excel error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to export Excel'
    });
  }
};

// ─── Super Admin: Get all staff across all schools ───
const getAllStaff = async (req, res) => {
  try {
    const staff = await staffService.getAllStaff(req.query);
    return sendSuccess(res, 200, "All staff fetched successfully.", staff);
  } catch (error) {
    console.error('Get all staff error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch all staff'
    });
  }
};

module.exports = { 
  create, 
  list, 
  getOne, 
  update, 
  deactivate, 
  assignSubject, 
  removeAssignment, 
  importExcel, 
  exportExcel,
  getAllStaff
};