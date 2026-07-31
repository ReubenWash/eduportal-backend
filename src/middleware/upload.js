const multer = require('multer');
const path = require('path');

// Configure multer for memory storage (for Cloudinary)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

module.exports = {
  upload,
  uploadDocument: upload.single('file'),
  uploadPhoto: upload.single('file'),
  uploadStudentPhoto: upload.single('file'),
  uploadStaffPhoto: upload.single('file'),
  uploadSchoolLogo: upload.single('file'),
};