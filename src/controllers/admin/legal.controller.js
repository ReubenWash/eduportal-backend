const { prisma } = require("../../config/db");
const { createError } = require("../../middleware/errorHandler");

// GET /api/v1/admin/legal
exports.getLegalDocuments = async (req, res) => {
  try {
    const { type, isActive, isPublished } = req.query;
    
    const where = {};
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (isPublished !== undefined) where.isPublished = isPublished === 'true';

    const documents = await prisma.legalDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      data: documents
    });
  } catch (error) {
    console.error('Error fetching legal documents:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch legal documents'
    });
  }
};

// GET /api/v1/admin/legal/:id
exports.getLegalDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await prisma.legalDocument.findUnique({
      where: { id }
    });

    if (!document) {
      throw createError('Legal document not found', 404);
    }

    return res.status(200).json({
      success: true,
      data: document
    });
  } catch (error) {
    console.error('Error fetching legal document:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch legal document'
    });
  }
};

// POST /api/v1/admin/legal
exports.createLegalDocument = async (req, res) => {
  try {
    const { type, title, content, version, isActive, isPublished } = req.body;

    // Validate required fields
    if (!type || !title || !content || !version) {
      throw createError('Type, title, content, and version are required', 400);
    }

    // Check if document with same type already exists
    const existing = await prisma.legalDocument.findFirst({
      where: { type }
    });

    if (existing) {
      throw createError(`A legal document with type "${type}" already exists`, 400);
    }

    const document = await prisma.legalDocument.create({
      data: {
        type,
        title,
        content,
        version,
        isActive: isActive !== undefined ? isActive : true,
        isPublished: isPublished !== undefined ? isPublished : false,
        publishedAt: isPublished ? new Date() : null
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Legal document created successfully',
      data: document
    });
  } catch (error) {
    console.error('Error creating legal document:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to create legal document'
    });
  }
};

// PATCH /api/v1/admin/legal/:id
exports.updateLegalDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, version, isActive, isPublished } = req.body;

    // Check if document exists
    const existing = await prisma.legalDocument.findUnique({
      where: { id }
    });

    if (!existing) {
      throw createError('Legal document not found', 404);
    }

    const updatedDocument = await prisma.legalDocument.update({
      where: { id },
      data: {
        title: title || existing.title,
        content: content || existing.content,
        version: version || existing.version,
        isActive: isActive !== undefined ? isActive : existing.isActive,
        isPublished: isPublished !== undefined ? isPublished : existing.isPublished,
        publishedAt: isPublished ? new Date() : existing.publishedAt
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Legal document updated successfully',
      data: updatedDocument
    });
  } catch (error) {
    console.error('Error updating legal document:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to update legal document'
    });
  }
};

// DELETE /api/v1/admin/legal/:id
exports.deleteLegalDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if document exists
    const existing = await prisma.legalDocument.findUnique({
      where: { id }
    });

    if (!existing) {
      throw createError('Legal document not found', 404);
    }

    await prisma.legalDocument.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: 'Legal document deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting legal document:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to delete legal document'
    });
  }
};

// GET /api/v1/admin/legal/consent-logs
exports.getConsentLogs = async (req, res) => {
  try {
    const { userId, legalDocumentId, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (userId) where.userId = userId;
    if (legalDocumentId) where.legalDocumentId = legalDocumentId;

    const [logs, total] = await Promise.all([
      prisma.consentLog.findMany({
        where,
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
              type: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: parseInt(offset),
        take: parseInt(limit)
      }),
      prisma.consentLog.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    console.error('Error fetching consent logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch consent logs'
    });
  }
};