const mediaService = require("../../services/admin/media.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");

// GET /api/v1/admin/media?folder=&search=
const list = async (req, res) => {
  try {
    const result = await mediaService.listMedia(req.query);
    return sendSuccess(res, 200, "Media fetched.", result);
  } catch (error) {
    console.error('List media error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch media'
    });
  }
};

// POST /api/v1/admin/media/upload  (multipart, field "file")
const upload = async (req, res) => {
  try {
    if (!req.file) {
      throw createError("No file uploaded", 400);
    }
    const asset = await mediaService.registerUpload(req.file, {
      userId: req.user?.userId,
      schoolId: req.user?.schoolId,
      role: req.user?.role,
    }, req.body);
    return sendSuccess(res, 201, "File uploaded.", asset);
  } catch (error) {
    console.error('Upload media error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload file'
    });
  }
};

// POST /api/v1/admin/media/delete  (body: { publicId, documentId })
const remove = async (req, res) => {
  try {
    const { publicId, documentId } = req.body || {};
    if (!publicId && !documentId) {
      throw createError("publicId or documentId is required", 400);
    }
    const result = await mediaService.deleteMedia(publicId, documentId);
    return sendSuccess(res, 200, "File deleted.", result);
  } catch (error) {
    console.error('Delete media error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete file'
    });
  }
};

module.exports = { list, upload, remove };