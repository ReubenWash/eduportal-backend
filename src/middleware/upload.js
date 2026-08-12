const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Configure multer for disk storage (for Cloudinary upload)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(os.tmpdir(), 'uploads');
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Keep original extension
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WEBP, and SVG are allowed.'), false);
  }
};

// ✅ Create a multer instance with disk storage
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// ✅ Helper to clean up temp files
const cleanupTempFile = (file) => {
  if (file && file.path) {
    fs.unlink(file.path, (err) => {
      if (err) console.error('Failed to delete temp file:', err);
    });
  }
};

// ✅ FIX: Custom middleware for school logo that accepts all fields
const uploadSchoolLogo = (req, res, next) => {
  // Use .any() to accept all fields (both file and text fields)
  const uploadMiddleware = upload.any();
  
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed',
      });
    }
    
    // ✅ Find the logo file in the uploaded files
    if (req.files && req.files.length > 0) {
      const logoFile = req.files.find(f => f.fieldname === 'logo' || f.fieldname === 'file');
      if (logoFile) {
        req.file = logoFile;
      }
    }
    
    // ✅ Parse text fields from FormData
    // Multer automatically puts text fields in req.body
    console.log('📤 Uploaded files:', req.files);
    console.log('📤 Body fields:', req.body);
    
    next();
  });
};

// ✅ For single file uploads (students, staff, documents)
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    const uploadMiddleware = upload.single(fieldName);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        console.error('❌ Multer error:', err);
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed',
        });
      }
      next();
    });
  };
};

// Export configured middleware
module.exports = {
  upload,
  uploadDocument: uploadSingle('file'),
  uploadPhoto: uploadSingle('file'),
  uploadStudentPhoto: uploadSingle('file'),
  uploadStaffPhoto: uploadSingle('file'),
  uploadSchoolLogo, // ✅ Updated to handle all fields
  cleanupTempFile, // ✅ Export cleanup helper
};