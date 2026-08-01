const staffService = require("../services/staff.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { parseExcelBuffer, generateExcelBuffer, sendExcelFile } = require("../utils/excel");
const { prisma } = require("../config/db");

// ─── Create Staff ───
const create = async (req, res) => {
  try {
    console.log('📤 Creating staff with data:', req.body);
    console.log('📤 File:', req.file);
    console.log('📤 School ID:', req.user?.schoolId);
    
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    const photoUrl = req.file?.path || null;
    const staff = await staffService.createStaff(req.user.schoolId, req.body, photoUrl);
    
    console.log('✅ Staff created:', staff.id);
    return sendSuccess(res, 201, "Staff created successfully.", staff);
  } catch (error) {
    console.error('❌ Create staff error:', error);
    
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
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
    console.error('❌ List staff error:', error);
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
    console.error('❌ Get one staff error:', error);
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
    console.log('📤 Updating staff:', req.params.id);
    console.log('📤 Data:', req.body);
    console.log('📤 File:', req.file);
    
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    const photoUrl = req.file?.path || null;
    const staff = await staffService.updateStaff(req.user.schoolId, req.params.id, req.body, photoUrl);
    
    console.log('✅ Staff updated:', staff.id);
    return sendSuccess(res, 200, "Staff updated successfully.", staff);
  } catch (error) {
    console.error('❌ Update staff error:', error);
    
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
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
    console.error('❌ Deactivate staff error:', error);
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
    
    const { subjectId, classId } = req.body;
    const staffId = req.params.id;
    
    console.log('📤 Assigning subject:', { staffId, subjectId, classId });
    
    if (!subjectId) {
      throw createError("Subject ID is required", 400);
    }
    if (!classId) {
      throw createError("Class ID is required", 400);
    }
    
    // ✅ Verify the subject exists in the school
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, schoolId: req.user.schoolId }
    });
    if (!subject) {
      throw createError("Subject not found in this school.", 404);
    }
    
    // ✅ Verify the class exists in the school
    const classExists = await prisma.class.findFirst({
      where: { id: classId, schoolId: req.user.schoolId }
    });
    if (!classExists) {
      throw createError("Class not found in this school.", 404);
    }
    
    // ✅ Verify the staff exists in the school
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, schoolId: req.user.schoolId }
    });
    if (!staff) {
      throw createError("Staff not found in this school.", 404);
    }
    
    const result = await staffService.assignSubject(
      req.user.schoolId, 
      staffId, 
      subjectId, 
      classId
    );
    
    console.log('✅ Subject assigned:', result);
    return sendSuccess(res, 200, "Subject assigned successfully.", result);
  } catch (error) {
    console.error('❌ Assign subject error:', error);
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
    
    const { subjectId, classId } = req.body;
    
    if (!subjectId) {
      throw createError("Subject ID is required", 400);
    }
    if (!classId) {
      throw createError("Class ID is required", 400);
    }
    
    await staffService.removeAssignment(
      req.user.schoolId, 
      req.params.id, 
      subjectId, 
      classId
    );
    return sendSuccess(res, 200, "Assignment removed successfully.");
  } catch (error) {
    console.error('❌ Remove assignment error:', error);
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
    
    console.log('📤 Importing Excel file:', req.file.originalname);
    const rows = await parseExcelBuffer(req.file.buffer);
    const result = await staffService.bulkImportStaffFromExcelRows(req.user.schoolId, rows);
    
    console.log('✅ Excel import completed:', result);
    return sendSuccess(res, 200, "Excel import completed.", result);
  } catch (error) {
    console.error('❌ Import Excel error:', error);
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
    
    console.log('📤 Exporting staff to Excel...');
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
        { header: "Subjects", key: "subjects", width: 30 },
        { header: "Classes", key: "classes", width: 20 },
      ],
      rows,
    });
    
    console.log('✅ Export completed');
    sendExcelFile(res, buffer, `staff-export-${Date.now()}.xlsx`);
  } catch (error) {
    console.error('❌ Export Excel error:', error);
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
    console.log('📤 Fetching all staff (Super Admin)...');
    const staff = await staffService.getAllStaff(req.query);
    return sendSuccess(res, 200, "All staff fetched successfully.", staff);
  } catch (error) {
    console.error('❌ Get all staff error:', error);
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

// ─── Super Admin: Get staff by school ───
const getStaffBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    console.log('📤 Fetching staff for school:', schoolId);
    
    if (!schoolId) {
      throw createError("School ID is required", 400);
    }
    
    const staff = await staffService.getStaffBySchool(schoolId, req.query);
    return sendSuccess(res, 200, "Staff fetched successfully.", staff);
  } catch (error) {
    console.error('❌ Get staff by school error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch staff by school'
    });
  }
};

// ─── Get staff statistics (Super Admin) ───
const getStaffStats = async (req, res) => {
  try {
    console.log('📤 Fetching staff statistics...');
    const stats = await staffService.getStaffStats();
    return sendSuccess(res, 200, "Staff statistics fetched successfully.", stats);
  } catch (error) {
    console.error('❌ Get staff stats error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch staff statistics'
    });
  }
};

// ─── EXPORTS ───
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
  getAllStaff,
  getStaffBySchool,
  getStaffStats
};