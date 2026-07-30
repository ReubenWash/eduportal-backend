const { prisma } = require("../config/db");

// Get all published legal documents
exports.getLegalDocuments = async (req, res) => {
  try {
    const documents = await prisma.legalDocument.findMany({
      where: {
        isPublished: true,
        isActive: true
      },
      select: {
        id: true,
        type: true,
        title: true,
        version: true,
        updatedAt: true
      },
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

// Get a specific legal document by type
exports.getLegalDocumentByType = async (req, res) => {
  try {
    const { type } = req.params;
    
    // Map URL paths to legal document types
    const typeMap = {
      'privacy': 'PRIVACY',
      'privacy-policy': 'PRIVACY',
      'terms': 'TERMS',
      'terms-of-service': 'TERMS',
      'cookie': 'COOKIE',
      'cookie-policy': 'COOKIE',
      'gdpr': 'GDPR',
      'gdpr-compliance': 'GDPR',
      'dpa': 'DPA',
      'data-processing': 'DPA',
      'acceptable-use': 'ACCEPTABLE_USE',
      'refund': 'REFUND',
      'refund-policy': 'REFUND'
    };
    
    const documentType = typeMap[type.toLowerCase()] || type.toUpperCase();

    const document = await prisma.legalDocument.findFirst({
      where: {
        type: documentType,
        isPublished: true,
        isActive: true
      },
      orderBy: { version: 'desc' }
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Legal document not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: document
    });
  } catch (error) {
    console.error('Error fetching legal document:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch legal document'
    });
  }
};