const { cloudinary } = require("../middleware/upload");
const { createError } = require("../middleware/errorHandler");

// All uploads in this app live under the "edutrack/" prefix in Cloudinary,
// split into subfolders: edutrack/students, edutrack/staff, edutrack/logos,
// edutrack/documents, edutrack/media. This lists real assets straight from
// Cloudinary's Admin API — there is no separate media table to keep in sync.

const FOLDERS = ["edutrack/media", "edutrack/logos", "edutrack/staff", "edutrack/students", "edutrack/documents"];

const listMedia = async ({ folder, search, cursor, maxResults = 30 }) => {
  const prefix = folder && FOLDERS.includes(folder) ? folder : "edutrack/";

  let result;
  try {
    result = await cloudinary.api.resources({
      type: "upload",
      prefix,
      max_results: Math.min(parseInt(maxResults) || 30, 100),
      next_cursor: cursor || undefined,
      context: true,
    });
  } catch (err) {
    throw createError(`Failed to fetch media from Cloudinary: ${err.message}`, 502);
  }

  let resources = result.resources || [];
  if (search) {
    const q = search.toLowerCase();
    resources = resources.filter((r) => r.public_id.toLowerCase().includes(q));
  }

  return {
    assets: resources.map((r) => ({
      publicId:  r.public_id,
      url:       r.secure_url,
      format:    r.format,
      bytes:     r.bytes,
      width:     r.width,
      height:    r.height,
      folder:    r.folder,
      createdAt: r.created_at,
    })),
    nextCursor: result.next_cursor || null,
    folders: FOLDERS,
  };
};

const deleteMedia = async (publicId) => {
  if (!publicId) throw createError("publicId is required.", 400);
  if (!publicId.startsWith("edutrack/")) {
    throw createError("Refusing to delete an asset outside the edutrack/ folder.", 400);
  }

  const result = await cloudinary.uploader.destroy(publicId);
  if (result.result !== "ok" && result.result !== "not found") {
    throw createError(`Cloudinary refused deletion: ${result.result}`, 502);
  }
  return { publicId, deleted: true };
};

module.exports = { listMedia, deleteMedia };
