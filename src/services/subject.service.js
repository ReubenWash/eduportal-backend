// src/services/subject.service.js
const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

// ─── Create Subject ───
const createSubject = async (schoolId, data) => {
  try {
    if (!schoolId) {
      throw createError("School ID is required.", 400);
    }

    const exists = await prisma.subject.findFirst({
      where: {
        schoolId,
        code: data.code.toUpperCase(),
      },
    });
    
    if (exists) {
      throw createError(`Subject with code ${data.code} already exists.`, 409);
    }
    
    return prisma.subject.create({
      data: {
        schoolId,
        name: data.name,
        code: data.code.toUpperCase(),
        type: data.type || "CORE",
      },
    });
  } catch (error) {
    console.error("❌ createSubject error:", error);
    throw error;
  }
};

// ─── Get All Subjects ───
const getSubjects = async (schoolId, query = {}) => {
  try {
    console.log(`📊 getSubjects called with schoolId: ${schoolId}`);
    
    if (!schoolId) {
      console.warn('⚠️ No schoolId provided, returning empty array');
      return [];
    }

    const where = { schoolId };
    
    if (query.type) {
      where.type = query.type;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
      ];
    }

    // ✅ Get subjects without relations first
    const subjects = await prisma.subject.findMany({
      where,
      orderBy: { name: "asc" },
    });

    console.log(`✅ Found ${subjects.length} subjects`);

    // ✅ Enrich each subject with related data
    const enrichedSubjects = await Promise.all(
      subjects.map(async (subject) => {
        // Get staff assignments
        const staffSubjects = await prisma.staffSubject.findMany({
          where: { subjectId: subject.id },
          include: {
            staff: {
              include: {
                user: {
                  select: {
                    email: true,
                    role: true,
                  }
                }
              }
            }
          }
        });

        // Get class assignments
        const classSubjects = await prisma.classSubject.findMany({
          where: { subjectId: subject.id },
          include: {
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        });

        return {
          ...subject,
          teachers: staffSubjects.map(ss => ({
            id: ss.staff.id,
            firstName: ss.staff.firstName,
            lastName: ss.staff.lastName,
            phone: ss.staff.phone,
            gender: ss.staff.gender,
            photoUrl: ss.staff.photoUrl,
            qualification: ss.staff.qualification,
            staffNumber: ss.staff.staffNumber,
            email: ss.staff.user?.email || null,
            role: ss.staff.user?.role || null,
          })),
          teacherCount: staffSubjects.length,
          classes: classSubjects.map(cs => cs.class),
          classCount: classSubjects.length,
        };
      })
    );

    return enrichedSubjects;
  } catch (error) {
    console.error("❌ getSubjects error:", error);
    return [];
  }
};

// ─── Get Single Subject ───
const getSubjectById = async (schoolId, subjectId) => {
  try {
    if (!schoolId) {
      throw createError("School ID is required.", 400);
    }

    // Get subject
    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw createError("Subject not found", 404);
    }

    // Get staff assignments
    const staffSubjects = await prisma.staffSubject.findMany({
      where: { subjectId: subject.id },
      include: {
        staff: {
          include: {
            user: {
              select: {
                email: true,
                role: true,
              }
            }
          }
        }
      }
    });

    // Get class assignments
    const classSubjects = await prisma.classSubject.findMany({
      where: { subjectId: subject.id },
      include: {
        class: {
          select: {
            id: true,
            level: true,
            section: true,
          }
        }
      }
    });

    return {
      ...subject,
      staffSubjects: staffSubjects.map(ss => ({
        ...ss,
        staff: {
          ...ss.staff,
          email: ss.staff.user?.email || null,
          role: ss.staff.user?.role || null,
        }
      })),
      classSubjects: classSubjects.map(cs => ({
        ...cs,
        class: cs.class,
      })),
    };
  } catch (error) {
    console.error("❌ getSubjectById error:", error);
    throw error;
  }
};

// ─── Update Subject ───
const updateSubject = async (schoolId, subjectId, data) => {
  try {
    if (!schoolId) {
      throw createError("School ID is required.", 400);
    }

    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw createError("Subject not found.", 404);
    }

    if (data.code) {
      const existing = await prisma.subject.findFirst({
        where: {
          schoolId,
          code: data.code.toUpperCase(),
          id: { not: subjectId },
        },
      });

      if (existing) {
        throw createError(`Subject with code ${data.code} already exists.`, 409);
      }
    }

    const updateData = {
      name: data.name,
      code: data.code?.toUpperCase(),
      type: data.type,
    };

    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    return prisma.subject.update({
      where: { id: subjectId },
      data: updateData,
    });
  } catch (error) {
    console.error("❌ updateSubject error:", error);
    throw error;
  }
};

// ─── Delete Subject ───
const deleteSubject = async (schoolId, subjectId) => {
  try {
    if (!schoolId) {
      throw createError("School ID is required.", 400);
    }

    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw createError("Subject not found.", 404);
    }

    const hasScores = await prisma.score.count({
      where: { subjectId },
    });

    if (hasScores > 0) {
      throw createError("Cannot delete a subject with recorded scores.", 400);
    }

    await prisma.subject.delete({
      where: { id: subjectId },
    });

    return { success: true, message: "Subject deleted successfully" };
  } catch (error) {
    console.error("❌ deleteSubject error:", error);
    throw error;
  }
};

// ─── Get Subjects by Teacher ───
const getSubjectsByTeacher = async (schoolId, teacherId) => {
  try {
    if (!schoolId) {
      return [];
    }

    const staffSubjects = await prisma.staffSubject.findMany({
      where: {
        staffId: teacherId,
      },
      include: {
        subject: true,
        class: {
          select: {
            id: true,
            level: true,
            section: true,
          }
        }
      }
    });

    return staffSubjects.map(ss => ({
      ...ss.subject,
      class: ss.class,
    }));
  } catch (error) {
    console.error("❌ getSubjectsByTeacher error:", error);
    return [];
  }
};

// ─── Get Subjects by Class ───
const getSubjectsByClass = async (schoolId, classId) => {
  try {
    if (!schoolId) {
      return [];
    }

    const classSubjects = await prisma.classSubject.findMany({
      where: {
        classId,
      },
      include: {
        subject: true,
      }
    });

    return classSubjects.map(cs => cs.subject);
  } catch (error) {
    console.error("❌ getSubjectsByClass error:", error);
    return [];
  }
};

module.exports = {
  createSubject,
  getSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
  getSubjectsByTeacher,
  getSubjectsByClass,
};