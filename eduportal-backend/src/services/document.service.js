const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { deleteFromCloudinary } = require("../middleware/upload");

// ── Create a document record, verifying any linked entity belongs
// to this school so a staff/student/guardian from a different tenant
// can never be attached to a document. ──
const createDocument = async (schoolId, uploadedById, fileInfo, data) => {
  const { studentId, staffId, guardianId, category } = data;

  if (studentId) {
    const s = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!s) throw createError("Student not found in this school.", 404);
  }
  if (staffId) {
    const s = await prisma.staff.findFirst({ where: { id: staffId, schoolId } });
    if (!s) throw createError("Staff member not found in this school.", 404);
  }
  if (guardianId) {
    const g = await prisma.guardian.findFirst({ where: { id: guardianId, schoolId } });
    if (!g) throw createError("Guardian not found in this school.", 404);
  }

  return prisma.document.create({
    data: {
      schoolId,
      uploadedById,
      studentId: studentId || null,
      staffId: staffId || null,
      guardianId: guardianId || null,
      category: category || null,
      url: fileInfo.url,
      originalName: fileInfo.originalName,
      mimeType: fileInfo.mimeType,
      size: fileInfo.size,
    },
  });
};

const getDocuments = async (schoolId, query) => {
  const where = { schoolId };
  if (query.studentId) where.studentId = query.studentId;
  if (query.staffId) where.staffId = query.staffId;
  if (query.guardianId) where.guardianId = query.guardianId;
  if (query.category) where.category = query.category;

  return prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { email: true } },
    },
  });
};

const getDocumentById = async (schoolId, documentId) => {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, schoolId },
    include: { uploadedBy: { select: { email: true } } },
  });
  if (!doc) throw createError("Document not found.", 404);
  return doc;
};

const deleteDocument = async (schoolId, documentId) => {
  const doc = await prisma.document.findFirst({ where: { id: documentId, schoolId } });
  if (!doc) throw createError("Document not found.", 404);

  await deleteFromCloudinary(doc.url);
  await prisma.document.delete({ where: { id: documentId } });
};

module.exports = { createDocument, getDocuments, getDocumentById, deleteDocument };