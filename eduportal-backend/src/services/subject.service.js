const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");

const createSubject = async (schoolId, data) => {
  const exists = await prisma.subject.findFirst({ where: { schoolId, code: data.code.toUpperCase() } });
  if (exists) throw createError(`Subject with code ${data.code} already exists.`, 409);
  return prisma.subject.create({ data: { schoolId, name: data.name, code: data.code.toUpperCase(), type: data.type || "CORE" } });
};

const getSubjects = async (schoolId, query) => {
  const where = { schoolId };
  if (query.type) where.type = query.type;
  return prisma.subject.findMany({ where, orderBy: { name: "asc" } });
};

const updateSubject = async (schoolId, subjectId, data) => {
  const s = await prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
  if (!s) throw createError("Subject not found.", 404);
  return prisma.subject.update({ where: { id: subjectId }, data });
};

const deleteSubject = async (schoolId, subjectId) => {
  const s = await prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
  if (!s) throw createError("Subject not found.", 404);
  const hasScores = await prisma.score.count({ where: { subjectId } });
  if (hasScores > 0) throw createError("Cannot delete a subject with recorded scores.", 400);
  await prisma.subject.delete({ where: { id: subjectId } });
};

module.exports = { createSubject, getSubjects, updateSubject, deleteSubject };
