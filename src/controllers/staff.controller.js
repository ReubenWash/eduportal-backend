// backend/src/services/staff.service.js
// Add this function if it doesn't exist

const getAllStaff = async (query) => {
  const { page = 1, limit = 20, search, role, schoolId } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (role) where.user = { role };
  if (schoolId) where.schoolId = schoolId;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { user: { email: { contains: search, mode: 'insensitive' } } }
    ];
  }

  const [staff, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          }
        },
        school: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    }),
    prisma.staff.count({ where })
  ]);

  return {
    data: staff,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    }
  };
};

// Don't forget to add to module.exports
module.exports = {
  createStaff,
  getStaff,
  getStaffById,
  updateStaff,
  deactivateStaff,
  assignSubject,
  removeAssignment,
  bulkImportStaffFromExcelRows,
  getStaffForExport,
  getAllStaff, // ✅ Add this
};