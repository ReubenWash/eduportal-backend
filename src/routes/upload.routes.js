const express = require('express');
const router = express.Router();
const { uploadPhoto } = require('../controllers/upload.controller');
const authenticate = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// All upload routes require authentication
router.use(authenticate);

// Upload photo (for students, staff, etc.)
router.post('/photo', upload.single('file'), uploadPhoto);

module.exports = router;