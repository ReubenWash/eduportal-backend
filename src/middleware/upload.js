const cloudinary  = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer      = require("multer");

// Configure Cloudinary SDK
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Storage configs ────────────────────────────────────────────

const studentPhotoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         "edutrack/students",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation:  [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
  },
});

const staffPhotoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         "edutrack/staff",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation:  [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
  },
});

const schoolLogoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         "edutrack/logos",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "svg"],
    transformation:  [{ width: 300, height: 300, crop: "limit" }],
  },
});

const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          "edutrack/documents",
    allowed_formats: ["pdf", "csv", "xlsx", "xls"],
    resource_type:   "raw",
  },
});

// ── Multer instances ───────────────────────────────────────────

const fileSizeLimit = 5 * 1024 * 1024; // 5 MB

const uploadStudentPhoto = multer({
  storage: studentPhotoStorage,
  limits:  { fileSize: fileSizeLimit },
}).single("photo");

const uploadStaffPhoto = multer({
  storage: staffPhotoStorage,
  limits:  { fileSize: fileSizeLimit },
}).single("photo");

const uploadSchoolLogo = multer({
  storage: schoolLogoStorage,
  limits:  { fileSize: fileSizeLimit },
}).single("logo");

const uploadDocument = multer({
  storage: documentStorage,
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB for documents
}).single("file");

// ── Helper: delete a file from Cloudinary by URL ──────────────
const deleteFromCloudinary = async (url) => {
  if (!url) return;
  try {
    // Extract public_id from URL
    const parts    = url.split("/");
    const filename = parts[parts.length - 1].split(".")[0];
    const folder   = parts[parts.length - 2];
    await cloudinary.uploader.destroy(`${folder}/${filename}`);
  } catch {
    // Non-critical — log but don't throw
  }
};

module.exports = {
  uploadStudentPhoto,
  uploadStaffPhoto,
  uploadSchoolLogo,
  uploadDocument,
  deleteFromCloudinary,
  cloudinary,
};
