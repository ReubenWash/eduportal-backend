const { cloudinary } = require("../../middleware/upload");
const { createError } = require("../../middleware/errorHandler");

const KNOWN_FOLDERS = [
  "edutrack/media",
  "edutrack/logos",
  "edutrack/staff",
  "edutrack/students",
  "edutrack/documents",
];

const listMedia = async ({ folder, search }) => {
  const prefix = folder || "edutrack";

  const result = await cloudinary.api.resources({
    type: "upload",
    prefix,
    max_results: 100,
    context: true,
  });

  let assets = (result.resources || []).map((r) => ({
    publicId:  r.public_id,
    url:       r.secure_url,
    format:    r.format,
    bytes:     r.bytes,
    width:     r.width,
    height:    r.height,
    createdAt: r.created_at,
  }));

  if (search) {
    const term = search.toLowerCase();
    assets = assets.filter((a) => a.publicId.toLowerCase().includes(term));
  }

  return { assets, folders: KNOWN_FOLDERS };
};

const registerUpload = (file) => {
  if (!file) throw createError("No file uploaded. Expected a file under field name 'file'.", 422);
  return {
    publicId: file.filename,
    url:      file.path,
    format:   (file.originalname.split(".").pop() || "").toLowerCase(),
    bytes:    file.size,
  };
};

const deleteMedia = async (publicId) => {
  if (!publicId) throw createError("publicId is required.", 400);
  const result = await cloudinary.uploader.destroy(publicId);
  if (result.result !== "ok" && result.result !== "not found") {
    throw createError(`Failed to delete asset: ${result.result}`, 500);
  }
  return { publicId, deleted: true };
};

module.exports = { listMedia, registerUpload, deleteMedia };
