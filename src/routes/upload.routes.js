const express = require('express');
const router = express.Router();
const { uploadPhoto, uploadDocument } = require('../controllers/upload.controller');
const authenticate = require('../middleware/auth');
const { activityAudit } = require('../middleware/tenant');
const { upload } = require('../middleware/upload');

// All upload routes require authentication
router.use(authenticate, activityAudit);

// Upload photo (for students, staff, etc.)
router.post('/photo', upload.single('file'), uploadPhoto);

// Upload document
router.post('/document', upload.single('file'), uploadDocument);

module.exports = router;