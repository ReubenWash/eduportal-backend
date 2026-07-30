const documentService = require("../services/document.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");

// POST /api/v1/documents/upload
const upload = async (req, res) => {
  if (!req.file) throw createError("No file uploaded. Expected a file under field name 'file'.", 422);

  let schoolId = req.user.schoolId;
  
  // If user is SUPER_ADMIN and schoolId is provided in body, use that
  if (req.user.role === 'SUPER_ADMIN' && req.body.schoolId) {
    schoolId = req.body.schoolId;
  }
  
  // If still no schoolId, throw error
  if (!schoolId) {
    throw createError("School ID is required for document upload. Please specify a school.", 400);
  }

  const doc = await documentService.createDocument(
    schoolId,
    req.user.userId,
    {
      url: req.file.path,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
    req.body
  );

  return sendSuccess(res, 201, "Document uploaded.", doc);
};

// GET /api/v1/documents
const list = async (req, res) => {
  let schoolId = req.user.schoolId;
  let docs;
  
  // For SUPER_ADMIN
  if (req.user.role === 'SUPER_ADMIN') {
    // If schoolId is provided in query, filter by that school
    if (req.query.schoolId) {
      docs = await documentService.getDocumentsBySchool(req.query.schoolId, req.query);
    } else {
      // Otherwise, return all documents across all schools
      docs = await documentService.getAllDocuments(req.query);
    }
  } else {
    // For regular users, only get their school's documents
    if (!schoolId) {
      throw createError("School ID not found for this user.", 400);
    }
    docs = await documentService.getDocuments(schoolId, req.query);
  }
  
  return sendSuccess(res, 200, "Documents fetched.", docs);
};

// GET /api/v1/documents/:id
const getOne = async (req, res) => {
  let schoolId = req.user.schoolId;
  let doc;
  
  // For SUPER_ADMIN, allow getting any document without schoolId filter
  if (req.user.role === 'SUPER_ADMIN') {
    doc = await documentService.getDocumentById(null, req.params.id);
  } else {
    // For regular users, enforce schoolId filter
    if (!schoolId) {
      throw createError("School ID not found for this user.", 400);
    }
    doc = await documentService.getDocumentById(schoolId, req.params.id);
  }
  
  return sendSuccess(res, 200, "Document fetched.", doc);
};

// DELETE /api/v1/documents/:id
const remove = async (req, res) => {
  let schoolId = req.user.schoolId;
  
  // For SUPER_ADMIN, allow deleting any document without schoolId filter
  if (req.user.role === 'SUPER_ADMIN') {
    await documentService.deleteDocument(null, req.params.id);
  } else {
    // For regular users, enforce schoolId filter
    if (!schoolId) {
      throw createError("School ID not found for this user.", 400);
    }
    await documentService.deleteDocument(schoolId, req.params.id);
  }
  
  return sendSuccess(res, 200, "Document deleted.");
};

module.exports = { upload, list, getOne, remove };