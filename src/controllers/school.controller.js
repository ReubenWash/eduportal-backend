const schoolService = require("../services/school.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const { prisma } = require("../config/db");
const cloudinary = require("../config/cloudinary");
const { cleanupTempFile } = require("../middleware/upload");

// ─── POST /api/v1/schools/register ───
const register = async (req, res) => {
  try {
    const school = await schoolService.registerSchool(req.body);
    return sendSuccess(res, 201, "School registered. Please check your email to verify your account.", school);
  } catch (error) {
    console.error('Register school error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to register school'
    });
  }
};

// ─── POST /api/v1/schools/manual (SUPER_ADMIN) ───
const manualCreate = async (req, res) => {
  try {
    const school = await schoolService.manualCreateSchool(req.body);
    return sendSuccess(res, 201, "School created successfully.", school);
  } catch (error) {
    console.error('Manual create school error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create school'
    });
  }
};

// ─── GET /api/v1/schools/me ───
const getProfile = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const school = await schoolService.getSchoolProfile(req.user.schoolId);
    return sendSuccess(res, 200, "School profile fetched.", school);
  } catch (error) {
    console.error('Get school profile error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch school profile'
    });
  }
};

// ─── PATCH /api/v1/schools/me ───
const updateProfile = async (req, res) => {
  console.log('🔍 updateProfile called');
  console.log('User:', req.user);
  console.log('Body:', req.body);
  console.log('File:', req.file);
  console.log('Files:', req.files);
  
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    
    let logoUrl = null;
    
    // ✅ Handle file upload from disk storage
    if (req.file) {
      try {
        console.log('📤 Uploading logo to Cloudinary...');
        
        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'edutrack/logos',
          transformation: [{ width: 300, height: 300, crop: 'limit' }],
        });
        
        logoUrl = result.secure_url;
        console.log('✅ Logo uploaded to Cloudinary:', logoUrl);
        
        // ✅ Clean up temp file
        cleanupTempFile(req.file);
      } catch (uploadError) {
        console.error('❌ Cloudinary upload error:', uploadError);
        // Continue without logo if upload fails
      }
    }
    
    // ✅ Build update data from req.body
    const updateData = {};
    
    // Handle text fields
    if (req.body.name !== undefined && req.body.name !== '') {
      updateData.name = req.body.name;
    }
    if (req.body.email !== undefined && req.body.email !== '') {
      updateData.email = req.body.email;
    }
    if (req.body.phone !== undefined && req.body.phone !== '') {
      updateData.phone = req.body.phone;
    }
    if (req.body.address !== undefined && req.body.address !== '') {
      updateData.address = req.body.address;
    }
    if (req.body.motto !== undefined && req.body.motto !== '') {
      updateData.motto = req.body.motto;
    }
    
    // Handle scoreLabels (might be stringified JSON)
    if (req.body.scoreLabels) {
      try {
        updateData.scoreLabels = typeof req.body.scoreLabels === 'string' 
          ? JSON.parse(req.body.scoreLabels) 
          : req.body.scoreLabels;
      } catch (parseError) {
        console.error('❌ Failed to parse scoreLabels:', parseError);
      }
    }
    
    // Use uploaded logo URL if available
    if (logoUrl) {
      updateData.logoUrl = logoUrl;
    }
    
    console.log('📤 Updating school with:', updateData);
    
    // ✅ Update the school
    const school = await schoolService.updateSchoolProfile(
      req.user.schoolId,
      updateData
    );
    
    console.log('✅ School updated:', school);
    return sendSuccess(res, 200, "School profile updated.", school);
    
  } catch (error) {
    console.error('❌ Update school profile error:', error);
    console.error('Error stack:', error.stack);
    
    // Clean up temp file if it exists
    if (req.file) {
      cleanupTempFile(req.file);
    }
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update school profile'
    });
  }
};

// ─── GET /api/v1/schools/me/dashboard ───
const getDashboard = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const stats = await schoolService.getDashboardStats(req.user.schoolId, req.user);
    return sendSuccess(res, 200, "Dashboard stats fetched.", stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch dashboard stats'
    });
  }
};

// ─── GET /api/v1/schools/admin/dashboard ───
const getSuperAdminDashboard = async (req, res) => {
  try {
    const dashboard = await schoolService.getSuperAdminDashboard();
    return sendSuccess(res, 200, "Super admin dashboard fetched.", dashboard);
  } catch (error) {
    console.error('Get super admin dashboard error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch super admin dashboard'
    });
  }
};

// ─── GET /api/v1/schools/me/terms ───
const getTerms = async (req, res) {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const terms = await schoolService.getTerms(req.user.schoolId, req.query.academicYear);
    return sendSuccess(res, 200, "Terms fetched.", terms);
  } catch (error) {
    console.error('Get terms error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch terms'
    });
  }
};

// ─── POST /api/v1/schools/me/terms ───
const createTerm = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const term = await schoolService.createTerm(req.user.schoolId, req.body);
    return sendSuccess(res, 201, "Term created.", term);
  } catch (error) {
    console.error('Create term error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create term'
    });
  }
};

// ─── PATCH /api/v1/schools/me/terms/:id ───
const updateTerm = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      throw createError("School ID not found. Please contact administrator.", 400);
    }
    const term = await schoolService.updateTerm(req.user.schoolId, req.params.id, req.body);
    return sendSuccess(res, 200, "Term updated.", term);
  } catch (error) {
    console.error('Update term error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update term'
    });
  }
};

// ─── GET /api/v1/schools (SUPER_ADMIN) ───
const getAllSchools = async (req, res) => {
  try {
    const result = await schoolService.getAllSchools(req.query);
    return sendSuccess(res, 200, "Schools fetched.", result);
  } catch (error) {
    console.error('Get all schools error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch schools'
    });
  }
};

// ─── PATCH /api/v1/schools/:id/status (SUPER_ADMIN) ───
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      throw createError("Status is required", 400);
    }

    const school = await schoolService.updateSchoolStatus(id, status);
    return sendSuccess(res, 200, `School status updated to ${status}`, school);
  } catch (error) {
    console.error('Update status error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update school status'
    });
  }
};

// ─── PATCH /api/v1/schools/:id (SUPER_ADMIN) ───
const updateSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const school = await schoolService.updateSchoolById(id, req.body);
    return sendSuccess(res, 200, "School updated.", school);
  } catch (error) {
    console.error('Update school error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update school'
    });
  }
};

// ─── PATCH /api/v1/schools/:id/plan (SUPER_ADMIN) ───
const updateSchoolPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan } = req.body;

    if (!plan) {
      throw createError("Plan is required", 400);
    }

    const school = await schoolService.updateSchoolPlan(id, plan);
    return sendSuccess(res, 200, `School plan updated to ${plan}`, school);
  } catch (error) {
    console.error('Update school plan error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update school plan'
    });
  }
};

// ─── DELETE /api/v1/schools/:id (SUPER_ADMIN) ───
const deleteSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await schoolService.deleteSchool(id, req.user.userId);
    return sendSuccess(res, 200, "School deactivated successfully.", result);
  } catch (error) {
    console.error('Delete school error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to deactivate school'
    });
  }
};

// ─── POST /api/v1/schools/:id/restore (SUPER_ADMIN) ───
const restoreSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await schoolService.restoreSchool(id, req.user.userId);
    return sendSuccess(res, 200, "School restored successfully.", result);
  } catch (error) {
    console.error('Restore school error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to restore school'
    });
  }
};

// ─── GET /api/v1/schools/:id/registration-pdf (SUPER_ADMIN) ───
const downloadRegistrationPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await schoolService.generateRegistrationPdf(id, req.user);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
    res.setHeader('Content-Length', result.pdfBuffer.length);
    
    res.send(result.pdfBuffer);
  } catch (error) {
    console.error('PDF Generation error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate registration PDF'
    });
  }
};

// ─── Debug Endpoints ───
const debugCheckSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const school = await prisma.school.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: school,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug check error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const debugGetStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const [school, users, refreshTokens] = await Promise.all([
      prisma.school.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
          createdAt: true
        }
      }),
      prisma.user.count({
        where: { schoolId: id }
      }),
      prisma.refreshToken.count({
        where: {
          user: {
            schoolId: id
          }
        }
      })
    ]);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        school,
        stats: {
          totalUsers: users,
          activeSessions: refreshTokens,
          hasUsers: users > 0,
          hasSessions: refreshTokens > 0
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug status error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const debugGetAllSchools = async (req, res) => {
  try {
    const schools = await prisma.school.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        createdAt: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      data: schools,
      count: schools.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug get all schools error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  register,
  manualCreate,
  getProfile,
  updateProfile,
  getDashboard,
  getSuperAdminDashboard,
  getTerms,
  createTerm,
  updateTerm,
  getAllSchools,
  updateStatus,
  updateSchool,
  updateSchoolPlan,
  deleteSchool,
  restoreSchool,
  downloadRegistrationPdf,
  debugCheckSchool,
  debugGetStatus,
  debugGetAllSchools,
};