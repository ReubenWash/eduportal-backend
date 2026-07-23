const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// LEGAL DOCUMENTS
// ─────────────────────────────────────────────────────

const getLegalDocuments = async (query) => {
  const { type, isActive, isPublished } = query;

  const where = {};
  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive === 'true';
  if (isPublished !== undefined) where.isPublished = isPublished === 'true';

  const documents = await prisma.legalDocument.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  return documents;
};

const getLegalDocumentById = async (id) => {
  const document = await prisma.legalDocument.findUnique({
    where: { id },
    include: {
      consentLogs: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });

  if (!document) {
    throw createError('Legal document not found', 404);
  }

  return document;
};

const getLegalDocumentByType = async (type, publishedOnly = true) => {
  const where = { type };
  if (publishedOnly) {
    where.isPublished = true;
    where.isActive = true;
  }

  const document = await prisma.legalDocument.findFirst({
    where,
    orderBy: { version: 'desc' }
  });

  return document;
};

const createLegalDocument = async (data) => {
  const { type, title, content, version, isActive = true, isPublished = false } = data;

  if (!type || !title || !content || !version) {
    throw createError('Type, title, content, and version are required', 400);
  }

  // Check for duplicate version
  const existing = await prisma.legalDocument.findFirst({
    where: { type, version }
  });

  if (existing) {
    throw createError('Document with this version already exists', 409);
  }

  const document = await prisma.legalDocument.create({
    data: {
      type,
      title,
      content,
      version,
      isActive,
      isPublished,
      publishedAt: isPublished ? new Date() : null
    }
  });

  return document;
};

const updateLegalDocument = async (id, data) => {
  const { title, content, isActive, isPublished } = data;

  const document = await prisma.legalDocument.findUnique({
    where: { id }
  });

  if (!document) {
    throw createError('Legal document not found', 404);
  }

  const updateData = {};
  if (title) updateData.title = title;
  if (content) updateData.content = content;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (isPublished !== undefined) {
    updateData.isPublished = isPublished;
    if (isPublished && !document.isPublished) {
      updateData.publishedAt = new Date();
    }
  }

  const updated = await prisma.legalDocument.update({
    where: { id },
    data: updateData
  });

  return updated;
};

const deleteLegalDocument = async (id) => {
  const document = await prisma.legalDocument.findUnique({
    where: { id }
  });

  if (!document) {
    throw createError('Legal document not found', 404);
  }

  await prisma.legalDocument.delete({
    where: { id }
  });

  return { message: 'Document deleted successfully' };
};

// ─────────────────────────────────────────────────────
// CONSENT LOGS
// ─────────────────────────────────────────────────────

const getConsentLogs = async (query) => {
  const { page = 1, limit = 20, userId, legalDocumentId, action } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (userId) where.userId = userId;
  if (legalDocumentId) where.legalDocumentId = legalDocumentId;
  if (action) where.action = action;

  const [logs, total] = await Promise.all([
    prisma.consentLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true
          }
        },
        legalDocument: {
          select: {
            id: true,
            title: true,
            type: true,
            version: true
          }
        }
      }
    }),
    prisma.consentLog.count({ where })
  ]);

  return {
    data: logs,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    }
  };
};

const logConsent = async (data) => {
  const { userId, legalDocumentId, action, ipAddress, userAgent, metadata } = data;

  if (!userId || !legalDocumentId || !action) {
    throw createError('User ID, document ID, and action are required', 400);
  }

  const log = await prisma.consentLog.create({
    data: {
      userId,
      legalDocumentId,
      action,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      metadata: metadata || null
    }
  });

  return log;
};

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

module.exports = {
  getLegalDocuments,
  getLegalDocumentById,
  getLegalDocumentByType,
  createLegalDocument,
  updateLegalDocument,
  deleteLegalDocument,
  getConsentLogs,
  logConsent
};