const multer = require("multer");

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Proof must be a JPG, PNG, WEBP or PDF file.")),
});

// Accepts the file under field name "proof" (or "file"); exposes it as req.file.
const uploadPaymentProof = (req, res, next) => {
  upload.fields([{ name: "proof", maxCount: 1 }, { name: "file", maxCount: 1 }])(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "Proof file must be 5MB or smaller." : err.message;
      return res.status(400).json({ success: false, message });
    }
    req.file = req.files?.proof?.[0] || req.files?.file?.[0];
    next();
  });
};

module.exports = { uploadPaymentProof };