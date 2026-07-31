const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

// ─── Create Class ───
const createClass = async (schoolId, data) => {
  try {
    console.log('[ClassService] createClass called with:', { schoolId, data });
    
    const { level, section, academicYear, classTeacherId } = data;
    
    // Validate required fields
    if (!level || !section || !academicYear) {
      throw createError('Level, section, and academicYear are required', 400);
    }
    
    // Check for existing class
    const existing = await prisma.class.findFirst({
      where: {
        schoolId,
        level,
        section,
        academicYear
      }
    });
    
    if (existing) {
      throw createError(`Class ${level} ${section} already exists for ${academicYear}`, 409);
    }
    
    // Verify class teacher belongs to school (if provided)
    if (classTeacherId) {
      const teacher = await prisma.staff.findFirst({
        where: { id: classTeacherId, schoolId }
      });
      if (!teacher) {
        throw createError("Class teacher not found in this school", 404);
      }
    }
    
    const newClass = await prisma.class.create({
      data: {
        schoolId,
        level,
        section,
        academicYear,
        classTeacherId: classTeacherId || null
      },
      include: {
        classTeacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        _count: {
          select: {
            enrollments: true,
            subjects: true
          }
        }
      }
    });
    
    console.log('[ClassService] Class created successfully:', newClass);
    return newClass;
  } catch (error) {
    console.error('[ClassService] createClass error:', error);
    throw error;
  }
};

// ─── Get Classes ───
const getClasses = async (schoolId, query = {}) => {
  try {
    console.log('[ClassService] getClasses called with schoolId:', schoolId);
    
    if (!schoolId) {
      throw createError('School ID is required', 400);
    }
    
    const where = { schoolId };
    if (query.level) where.level = query.level;
    if (query.academicYear) where.academicYear = query.academicYear;
    
    const classes = await prisma.class.findMany({
      where,
      orderBy: [
        { level: 'asc' },
        { section: 'asc' }
      ],
      include: {
        classTeacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        _count: {
          select: {
            enrollments: true,
            subjects: true
          }
        }
      }
    });
    
    console.log('[ClassService] Found classes:', classes.length);
    return classes;
  } catch (error) {
    console.error('[ClassService] getClasses error:', error);
    throw error;
  }
};

// ─── Get Class By ID ───
const getClassById = async (schoolId, classId) => {
  try {
    console.log('[ClassService] getClassById called with:', { schoolId, classId });
    
    if (!schoolId) {
      throw createError('School ID is required', 400);
    }
    
    const cls = await prisma.class.findFirst({
      where: { 
        id: classId, 
        schoolId 
      },
      include: {
        classTeacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        _count: {
          select: {
            enrollments: true,
            subjects: true
          }
        }
      }
    });
    
    if (!cls) {
      throw createError("Class not found", 404);
    }
    
    return cls;
  } catch (error) {
    console.error('[ClassService] getClassById error:', error);
    throw error;
  }
};

// ─── Update Class ───
const updateClass = async (schoolId, classId, data) => {
  try {
    console.log('[ClassService] updateClass called with:', { schoolId, classId, data });
    
    if (!schoolId) {
      throw createError('School ID is required', 400);
    }
    
    const { level, section, academicYear, classTeacherId } = data;
    
    // Verify class exists
    const existing = await prisma.class.findFirst({
      where: { id: classId, schoolId }
    });
    
    if (!existing) {
      throw createError("Class not found", 404);
    }
    
    // Verify class teacher belongs to school (if provided)
    if (classTeacherId) {
      const teacher = await prisma.staff.findFirst({
        where: { id: classTeacherId, schoolId }
      });
      if (!teacher) {
        throw createError("Class teacher not found in this school", 404);
      }
    }
    
    const updated = await prisma.class.update({
      where: { id: classId },
      data: {
        level: level || existing.level,
        section: section || existing.section,
        academicYear: academicYear || existing.academicYear,
        classTeacherId: classTeacherId || null
      },
      include: {
        classTeacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        _count: {
          select: {
            enrollments: true,
            subjects: true
          }
        }
      }
    });
    
    console.log('[ClassService] Class updated successfully:', updated);
    return updated;
  } catch (error) {
    console.error('[ClassService] updateClass error:', error);
    throw error;
  }
};

// ─── Delete Class ───
const deleteClass = async (schoolId, classId) => {
  try {
    console.log('[ClassService] deleteClass called with:', { schoolId, classId });
    
    if (!schoolId) {
      throw createError('School ID is required', 400);
    }
    
    const cls = await prisma.class.findFirst({
      where: { id: classId, schoolId }
    });
    
    if (!cls) {
      throw createError("Class not found", 404);
    }
    
    // Check if class has enrollments
    const enrollments = await prisma.enrollment.count({
      where: { classId }
    });
    
    if (enrollments > 0) {
      throw createError(`Cannot delete class with ${enrollments} enrolled students`, 400);
    }
    
    await prisma.class.delete({
      where: { id: classId }
    });
    
    console.log('[ClassService] Class deleted successfully');
    return { success: true };
  } catch (error) {
    console.error('[ClassService] deleteClass error:', error);
    throw error;
  }
};

// ─── Assign Subject to Class ───
const assignSubjectToClass = async (schoolId, classId, subjectId) => {
  try {
    console.log('[ClassService] assignSubjectToClass called with:', { schoolId, classId, subjectId });
    
    if (!schoolId) {
      throw createError('School ID is required', 400);
    }
    
    // Verify class exists
    const cls = await prisma.class.findFirst({
      where: { id: classId, schoolId }
    });
    
    if (!cls) {
      throw createError("Class not found", 404);
    }
    
    // Verify subject exists and belongs to school
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, schoolId }
    });
    
    if (!subject) {
      throw createError("Subject not found in this school", 404);
    }
    
    // Check if already assigned
    const existing = await prisma.classSubject.findUnique({
      where: {
        classId_subjectId: {
          classId,
          subjectId
        }
      }
    });
    
    if (existing) {
      throw createError("Subject already assigned to this class", 409);
    }
    
    const result = await prisma.classSubject.create({
      data: {
        classId,
        subjectId
      },
      include: {
        subject: true
      }
    });
    
    console.log('[ClassService] Subject assigned successfully');
    return result;
  } catch (error) {
    console.error('[ClassService] assignSubjectToClass error:', error);
    throw error;
  }
};

// ─── Remove Subject from Class ───
const removeSubjectFromClass = async (schoolId, classId, subjectId) => {
  try {
    console.log('[ClassService] removeSubjectFromClass called with:', { schoolId, classId, subjectId });
    
    if (!schoolId) {
      throw createError('School ID is required', 400);
    }
    
    const existing = await prisma.classSubject.findFirst({
      where: {
        classId,
        subjectId,
        class: { schoolId }
      }
    });
    
    if (!existing) {
      throw createError("Subject not assigned to this class", 404);
    }
    
    await prisma.classSubject.delete({
      where: {
        classId_subjectId: {
          classId,
          subjectId
        }
      }
    });
    
    console.log('[ClassService] Subject removed successfully');
    return { success: true };
  } catch (error) {
    console.error('[ClassService] removeSubjectFromClass error:', error);
    throw error;
  }
};

// ─── EXPORTS ───
module.exports = {
  createClass,
  getClasses,
  getClassById,
  updateClass,
  deleteClass,
  assignSubjectToClass,
  removeSubjectFromClass
};