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
    
    const where = schoolId ? { schoolId } : {};
    
    if (query.type) {
      where.type = query.type;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const subjects = await prisma.subject.findMany({
      where,
      include: {
        staffSubjects: {
          include: {
            staff: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                gender: true,
                photoUrl: true,
                qualification: true,
                staffNumber: true,
                user: {
                  select: {
                    email: true,
                    role: true,
                  }
                }
              }
            },
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        },
        classSubjects: {
          include: {
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        }
      },
      orderBy: { name: "asc" },
    });

    console.log(`✅ Found ${subjects.length} subjects`);

    return subjects.map(subject => ({
      ...subject,
      teachers: subject.staffSubjects.map(ss => ({
        ...ss.staff,
        email: ss.staff.user?.email || null,
        role: ss.staff.user?.role || null,
        class: ss.class,
      })),
      teacherCount: subject.staffSubjects.length,
      classes: subject.classSubjects.map(cs => cs.class),
      classCount: subject.classSubjects.length,
    }));
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

    const subject = await prisma.subject.findFirst({
      where: {
        id: subjectId,
        schoolId,
      },
      include: {
        staffSubjects: {
          include: {
            staff: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                gender: true,
                photoUrl: true,
                qualification: true,
                staffNumber: true,
                user: {
                  select: {
                    email: true,
                    role: true,
                  }
                }
              }
            },
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        },
        classSubjects: {
          include: {
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        }
      },
    });

    if (!subject) {
      throw createError("Subject not found", 404);
    }

    return subject;
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

    const subjects = await prisma.subject.findMany({
      where: {
        schoolId,
        staffSubjects: {
          some: {
            staffId: teacherId,
          },
        },
      },
      include: {
        staffSubjects: {
          include: {
            staff: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                user: {
                  select: {
                    email: true,
                  }
                }
              }
            },
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              }
            }
          }
        },
      },
      orderBy: { name: "asc" },
    });

    return subjects.map(subject => ({
      ...subject,
      classes: subject.staffSubjects.map(ss => ss.class),
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

    const subjects = await prisma.subject.findMany({
      where: {
        schoolId,
        classSubjects: {
          some: {
            classId,
          },
        },
      },
      include: {
        staffSubjects: {
          include: {
            staff: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                user: {
                  select: {
                    email: true,
                  }
                }
              }
            }
          }
        },
      },
      orderBy: { name: "asc" },
    });

    return subjects.map(subject => ({
      ...subject,
      teachers: subject.staffSubjects.map(ss => ss.staff),
    }));
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