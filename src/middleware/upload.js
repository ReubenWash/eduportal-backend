// backend/src/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ✅ CHANGE: Use memory storage (not disk storage)
// This keeps the file in memory as a buffer, which your controller expects
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WEBP, and SVG are allowed.'), false);
  }
};

// ✅ Create a multer instance with memory storage
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// ✅ Helper to clean up temp files (not needed for memory storage, but keep for compatibility)
const cleanupTempFile = (file) => {
  // Memory storage doesn't create temp files, so this is a no-op
  if (file && file.buffer) {
    // Optionally clear the buffer to free memory
    file.buffer = null;
  }
};

// ✅ Custom middleware for school logo that accepts all fields
const uploadSchoolLogo = (req, res, next) => {
  const uploadMiddleware = upload.any();
  
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed',
      });
    }
    
    if (req.files && req.files.length > 0) {
      const logoFile = req.files.find(f => f.fieldname === 'logo' || f.fieldname === 'file');
      if (logoFile) {
        req.file = logoFile;
      }
    }
    
    console.log('📤 Uploaded files:', req.files?.length || 0);
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
  uploadSchoolLogo,
  cleanupTempFile,
};