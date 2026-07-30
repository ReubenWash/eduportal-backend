const schoolService = require("../../services/school.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");
const { prisma } = require("../../config/db");

// GET /api/v1/admin/schools
const getAllSchools = async (req, res) => {
  const result = await schoolService.getAllSchools(req.query);
  return sendSuccess(res, 200, "Schools fetched successfully", result);
};

// GET /api/v1/admin/schools/:id
const getSchoolById = async (req, res) => {
  const { id } = req.params;
  
  const school = await prisma.school.findUnique({
    where: { id },
    include: {
      users: {
        where: { role: 'SCHOOL_ADMIN' },
        select: {
          id: true,
          email: true,
          isVerified: true,
          staff: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              photoUrl: true
            }
          }
        }
      },
      _count: {
        select: {
          students: true,
          staff: true,
          classes: true
        }
      }
    }
  });

  if (!school) {
    throw createError("School not found", 404);
  }

  return sendSuccess(res, 200, "School fetched successfully", school);
};

// PATCH /api/v1/admin/schools/:id
const updateSchool = async (req, res) => {
  const { id } = req.params;
  const school = await schoolService.updateSchoolById(id, req.body);
  return sendSuccess(res, 200, "School updated successfully", school);
};

// PATCH /api/v1/admin/schools/:id/status
const updateSchoolStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    throw createError("Status is required", 400);
  }

  const school = await schoolService.updateSchoolStatus(id, status);
  return sendSuccess(res, 200, `School status updated to ${status}`, school);
};

// PATCH /api/v1/admin/schools/:id/plan
const updateSchoolPlan = async (req, res) => {
  const { id } = req.params;
  const { plan } = req.body;

  if (!plan) {
    throw createError("Plan is required", 400);
  }

  const school = await schoolService.updateSchoolPlan(id, plan);
  return sendSuccess(res, 200, `School plan updated to ${plan}`, school);
};

// DELETE /api/v1/admin/schools/:id
const deleteSchool = async (req, res) => {
  const { id } = req.params;
  const result = await schoolService.deleteSchool(id, req.user.userId);
  return sendSuccess(res, 200, "School deactivated successfully", result);
};

// POST /api/v1/admin/schools/:id/restore
const restoreSchool = async (req, res) => {
  const { id } = req.params;
  const result = await schoolService.restoreSchool(id, req.user.userId);
  return sendSuccess(res, 200, "School restored successfully", result);
};

// GET /api/v1/admin/schools/:id/registration-pdf
const downloadRegistrationPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await schoolService.generateRegistrationPdf(id, req.user);
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
    res.setHeader('Content-Length', result.pdfBuffer.length);
    
    // Send the PDF buffer
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

// GET /api/v1/admin/schools/stats/overview
const getSchoolStats = async (req, res) => {
  const [
    totalSchools,
    activeSchools,
    pendingSchools,
    suspendedSchools,
    rejectedSchools,
    deactivatedSchools,
  ] = await Promise.all([
    prisma.school.count(),
    prisma.school.count({ where: { status: 'ACTIVE' } }),
    prisma.school.count({ where: { status: 'PENDING' } }),
    prisma.school.count({ where: { status: 'SUSPENDED' } }),
    prisma.school.count({ where: { status: 'REJECTED' } }),
    prisma.school.count({ where: { status: 'DEACTIVATED' } }),
  ]);

  // Get recent registrations
  const recentRegistrations = await prisma.school.findMany({
    where: { status: { not: 'DEACTIVATED' } },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      _count: {
        select: { students: true, staff: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  // Get registration trend (last 6 months)
  const registrationTrend = await prisma.$queryRaw`
    SELECT to_char("createdAt", 'Mon') as month, COUNT(*)::int as count
    FROM schools
    WHERE "createdAt" >= CURRENT_DATE - INTERVAL '6 months'
    AND status != 'DEACTIVATED'
    GROUP BY 1
    ORDER BY MIN("createdAt")
  `;

  return sendSuccess(res, 200, "School statistics fetched", {
    totals: {
      totalSchools,
      activeSchools,
      pendingSchools,
      suspendedSchools,
      rejectedSchools,
      deactivatedSchools,
    },
    recentRegistrations,
    registrationTrend: Array.isArray(registrationTrend)
      ? registrationTrend.map((item) => ({ 
          month: item.month, 
          count: Number(item.count || 0) 
        }))
      : [],
  });
};

module.exports = {
  getAllSchools,
  getSchoolById,
  updateSchool,
  updateSchoolStatus,
  updateSchoolPlan,
  deleteSchool,
  restoreSchool,
  downloadRegistrationPdf,
  getSchoolStats,
};