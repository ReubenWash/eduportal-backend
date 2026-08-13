const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

// ─── Create Subject ───
const createSubject = async (schoolId, data) => {
  // Check if subject with same code exists
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
};

// ─── Get All Subjects (with filters and relations) ───
const getSubjects = async (schoolId, query = {}) => {
  const where = { schoolId };
  
  // Apply type filter if provided
  if (query.type) {
    where.type = query.type;
  }

  // If search term is provided
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
        select: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          class: {
            select: {
              id: true,
              level: true,
              section: true,
            },
          },
        },
      },
      classSubjects: {
        select: {
          class: {
            select: {
              id: true,
              level: true,
              section: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Format response with counts and structured data
  return subjects.map(subject => ({
    ...subject,
    teachers: subject.staffSubjects.map(ss => ss.staff),
    teacherCount: subject.staffSubjects.length,
    classes: subject.classSubjects.map(cs => cs.class),
    classCount: subject.classSubjects.length,
  }));
};

// ─── Get Single Subject by ID ───
const getSubjectById = async (schoolId, subjectId) => {
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
              email: true,
            },
          },
          class: {
            select: {
              id: true,
              level: true,
              section: true,
            },
          },
        },
      },
      classSubjects: {
        include: {
          class: {
            select: {
              id: true,
              level: true,
              section: true,
            },
          },
        },
      },
    },
  });

  if (!subject) {
    throw createError("Subject not found", 404);
  }

  return subject;
};

// ─── Update Subject ───
const updateSubject = async (schoolId, subjectId, data) => {
  // Check if subject exists
  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      schoolId,
    },
  });

  if (!subject) {
    throw createError("Subject not found.", 404);
  }

  // If code is being updated, check for duplicates
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

  // Prepare update data
  const updateData = {
    name: data.name,
    code: data.code?.toUpperCase(),
    type: data.type,
  };

  // Remove undefined fields
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) delete updateData[key];
  });

  return prisma.subject.update({
    where: { id: subjectId },
    data: updateData,
  });
};

// ─── Delete Subject ───
const deleteSubject = async (schoolId, subjectId) => {
  // Check if subject exists
  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      schoolId,
    },
  });

  if (!subject) {
    throw createError("Subject not found.", 404);
  }

  // Check if subject has recorded scores
  const hasScores = await prisma.score.count({
    where: { subjectId },
  });

  if (hasScores > 0) {
    throw createError("Cannot delete a subject with recorded scores.", 400);
  }

  // Delete the subject
  await prisma.subject.delete({
    where: { id: subjectId },
  });
};

// ─── Get Subjects by Teacher ───
const getSubjectsByTeacher = async (schoolId, teacherId) => {
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
        select: {
          class: {
            select: {
              id: true,
              level: true,
              section: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return subjects.map(subject => ({
    ...subject,
    classes: subject.staffSubjects.map(ss => ss.class),
  }));
};

// ─── Get Subjects by Class ───
const getSubjectsByClass = async (schoolId, classId) => {
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
        select: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return subjects.map(subject => ({
    ...subject,
    teachers: subject.staffSubjects.map(ss => ss.staff),
  }));
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