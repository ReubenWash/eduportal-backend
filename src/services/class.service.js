const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");

const createClass = async (schoolId, data) => {
  const exists = await prisma.class.findFirst({ where: { schoolId, level: data.level, section: data.section, academicYear: data.academicYear } });
  if (exists) throw createError(`Class ${data.level} ${data.section} already exists for ${data.academicYear}.`, 409);
  return prisma.class.create({ data: { schoolId, level: data.level, section: data.section, academicYear: data.academicYear, classTeacherId: data.classTeacherId || null } });
};

const getClasses = async (schoolId, query) => {
  const where = { schoolId };
  if (query.level)        where.level        = query.level;
  if (query.academicYear) where.academicYear = query.academicYear;
  return prisma.class.findMany({
    where, orderBy: [{ level: "asc" }, { section: "asc" }],
    include: {
      classTeacher: { select: { firstName: true, lastName: true } },
      _count: { select: { enrollments: true } },
    },
  });
};

const getClassById = async (schoolId, classId) => {
  const c = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    include: {
      classTeacher: { select: { firstName: true, lastName: true, photoUrl: true } },
      subjects: { include: { subject: { select: { name: true, code: true, type: true } } } },
      enrollments: {
        include: { student: { select: { id: true, firstName: true, lastName: true, studentNumber: true, photoUrl: true } } },
      },
    },
  });
  if (!c) throw createError("Class not found.", 404);
  return c;
};

const updateClass = async (schoolId, classId, data) => {
  const c = await prisma.class.findFirst({ where: { id: classId, schoolId } });
  if (!c) throw createError("Class not found.", 404);
  return prisma.class.update({ where: { id: classId }, data });
};

const deleteClass = async (schoolId, classId) => {
  const c = await prisma.class.findFirst({ where: { id: classId, schoolId } });
  if (!c) throw createError("Class not found.", 404);
  const count = await prisma.enrollment.count({ where: { classId } });
  if (count > 0) throw createError("Cannot delete a class with enrolled students.", 400);
  await prisma.class.delete({ where: { id: classId } });
};

const assignSubjectToClass = async (schoolId, classId, subjectId) => {
  const c = await prisma.class.findFirst({ where: { id: classId, schoolId } });
  if (!c) throw createError("Class not found.", 404);
  return prisma.classSubject.upsert({
    where:  { classId_subjectId: { classId, subjectId } },
    create: { classId, subjectId },
    update: {},
  });
};

const removeSubjectFromClass = async (schoolId, classId, subjectId) => {
  const c = await prisma.class.findFirst({ where: { id: classId, schoolId } });
  if (!c) throw createError("Class not found.", 404);
  await prisma.classSubject.delete({ where: { classId_subjectId: { classId, subjectId } } });
};

module.exports = { createClass, getClasses, getClassById, updateClass, deleteClass, assignSubjectToClass, removeSubjectFromClass };
