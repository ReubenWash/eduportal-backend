const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { deleteFromCloudinary } = require("../middleware/upload");

// ── Create a document record, verifying any linked entity belongs
// to this school so a staff/student/guardian from a different tenant
// can never be attached to a document. ──
const createDocument = async (schoolId, uploadedById, fileInfo, data) => {
  const { studentId, staffId, guardianId, category } = data;

  // Only verify relationships if schoolId is provided
  if (schoolId) {
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

// ── Get documents with optional filters ──
const getDocuments = async (schoolId, query) => {
  const where = {};
  
  // If schoolId is provided, filter by it
  if (schoolId) {
    where.schoolId = schoolId;
  }
  
  // Add additional filters
  if (query.studentId) where.studentId = query.studentId;
  if (query.staffId) where.staffId = query.staffId;
  if (query.guardianId) where.guardianId = query.guardianId;
  if (query.category && query.category !== 'all') where.category = query.category;
  
  // If schoolId is not provided and no filters, return all documents
  // (This is useful for SUPER_ADMIN)
  if (!schoolId && !query.studentId && !query.staffId && !query.guardianId && !query.category) {
    // Return all documents without filtering by school
  }

  const documents = await prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { 
        select: { 
          email: true,
          role: true,
          staff: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        } 
      },
      school: {
        select: {
          id: true,
          name: true
        }
      }
    },
  });

  // Transform data for frontend
  return documents.map(doc => ({
    ...doc,
    uploadedBy: doc.uploadedBy?.staff 
      ? `${doc.uploadedBy.staff.firstName} ${doc.uploadedBy.staff.lastName}`
      : doc.uploadedBy?.email || 'Unknown'
  }));
};

// ── Get a single document by ID ──
const getDocumentById = async (schoolId, documentId) => {
  let where = { id: documentId };
  
  // If schoolId is provided, include it in the query
  if (schoolId) {
    where.schoolId = schoolId;
  }
  
  const doc = await prisma.document.findFirst({
    where,
    include: { 
      uploadedBy: { 
        select: { 
          email: true,
          role: true,
          staff: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        } 
      },
      school: {
        select: {
          id: true,
          name: true
        }
      }
    },
  });
  
  if (!doc) throw createError("Document not found.", 404);
  
  // Transform data for frontend
  return {
    ...doc,
    uploadedBy: doc.uploadedBy?.staff 
      ? `${doc.uploadedBy.staff.firstName} ${doc.uploadedBy.staff.lastName}`
      : doc.uploadedBy?.email || 'Unknown'
  };
};

// ── Delete a document ──
const deleteDocument = async (schoolId, documentId) => {
  let where = { id: documentId };
  
  // If schoolId is provided, include it in the query
  if (schoolId) {
    where.schoolId = schoolId;
  }
  
  const doc = await prisma.document.findFirst({ where });
  if (!doc) throw createError("Document not found.", 404);

  // Delete from Cloudinary if URL is from Cloudinary
  if (doc.url && doc.url.includes('cloudinary')) {
    await deleteFromCloudinary(doc.url);
  }
  
  await prisma.document.delete({ where: { id: documentId } });
};

// ── Get all documents (for SUPER_ADMIN) ──
const getAllDocuments = async (query) => {
  const where = {};
  
  if (query.schoolId) where.schoolId = query.schoolId;
  if (query.studentId) where.studentId = query.studentId;
  if (query.staffId) where.staffId = query.staffId;
  if (query.guardianId) where.guardianId = query.guardianId;
  if (query.category && query.category !== 'all') where.category = query.category;

  const documents = await prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { 
        select: { 
          email: true,
          role: true,
          staff: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        } 
      },
      school: {
        select: {
          id: true,
          name: true
        }
      }
    },
  });

  // Transform data for frontend
  return documents.map(doc => ({
    ...doc,
    uploadedBy: doc.uploadedBy?.staff 
      ? `${doc.uploadedBy.staff.firstName} ${doc.uploadedBy.staff.lastName}`
      : doc.uploadedBy?.email || 'Unknown'
  }));
};

// ── Get documents by school ID (for SUPER_ADMIN) ──
const getDocumentsBySchool = async (schoolId, query) => {
  const where = { schoolId };
  
  if (query.studentId) where.studentId = query.studentId;
  if (query.staffId) where.staffId = query.staffId;
  if (query.guardianId) where.guardianId = query.guardianId;
  if (query.category && query.category !== 'all') where.category = query.category;

  const documents = await prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { 
        select: { 
          email: true,
          role: true,
          staff: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        } 
      },
      school: {
        select: {
          id: true,
          name: true
        }
      }
    },
  });

  // Transform data for frontend
  return documents.map(doc => ({
    ...doc,
    uploadedBy: doc.uploadedBy?.staff 
      ? `${doc.uploadedBy.staff.firstName} ${doc.uploadedBy.staff.lastName}`
      : doc.uploadedBy?.email || 'Unknown'
  }));
};

module.exports = { 
  createDocument, 
  getDocuments, 
  getDocumentById, 
  deleteDocument,
  getAllDocuments,
  getDocumentsBySchool
};