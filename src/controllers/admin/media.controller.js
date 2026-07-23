const mediaService = require("../../services/admin/media.service");
const { sendSuccess } = require("../../utils/apiResponse");

// GET /api/v1/admin/media?folder=&search=
const list = async (req, res) => {
  const result = await mediaService.listMedia(req.query);
  return sendSuccess(res, 200, "Media fetched.", result);
};

// POST /api/v1/admin/media/upload  (multipart, field "file")
const upload = async (req, res) => {
  const asset = mediaService.registerUpload(req.file);
  return sendSuccess(res, 201, "File uploaded.", asset);
};

// POST /api/v1/admin/media/delete  (body: { publicId })
const remove = async (req, res) => {
  const result = await mediaService.deleteMedia(req.body.publicId);
  return sendSuccess(res, 200, "File deleted.", result);
};

module.exports = { list, upload, remove };
