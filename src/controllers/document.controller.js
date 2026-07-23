const documentService = require("../services/document.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");

// POST /api/v1/documents/upload
// multipart/form-data — field "file" (pdf/csv/xlsx/xls, 10MB max)
// Optional body fields: studentId, staffId, guardianId, category
const upload = async (req, res) => {
  if (!req.file) throw createError("No file uploaded. Expected a file under field name 'file'.", 422);

  const doc = await documentService.createDocument(
    req.user.schoolId,
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

// GET /api/v1/documents?studentId=&staffId=&guardianId=&category=
const list = async (req, res) => {
  const docs = await documentService.getDocuments(req.user.schoolId, req.query);
  return sendSuccess(res, 200, "Documents fetched.", docs);
};

// GET /api/v1/documents/:id
const getOne = async (req, res) => {
  const doc = await documentService.getDocumentById(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Document fetched.", doc);
};

// DELETE /api/v1/documents/:id
const remove = async (req, res) => {
  await documentService.deleteDocument(req.user.schoolId, req.params.id);
  return sendSuccess(res, 200, "Document deleted.");
};

module.exports = { upload, list, getOne, remove };