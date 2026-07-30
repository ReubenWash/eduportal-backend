const { prisma } = require("../config/db");

const checkSchoolStatus = async (req, res, next) => {
  // Skip for public routes
  const publicRoutes = ['/auth/login', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];
  if (publicRoutes.includes(req.path)) {
    return next();
  }

  // Skip if no user or no schoolId
  if (!req.user || !req.user.schoolId) {
    return next();
  }

  try {
    const school = await prisma.school.findUnique({
      where: { id: req.user.schoolId },
      select: { status: true }
    });

    if (!school) {
      return res.status(403).json({
        success: false,
        message: "School not found. Please contact support."
      });
    }

    if (school.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: "Your school account is not active. Please contact support.",
        code: 'SCHOOL_INACTIVE'
      });
    }

    next();
  } catch (error) {
    console.error('Error checking school status:', error);
    next(error);
  }
};

module.exports = { checkSchoolStatus };