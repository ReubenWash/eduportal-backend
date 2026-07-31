const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/media.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');
const { uploadMediaAsset } = require('../../middleware/upload');

router.use(authenticate, isSuperAdmin);

// ─── Media Management (GET only) ───
router.get('/', controller.list);

// ─── TEMPORARILY COMMENTED OUT - Fix controller.upload ───
// router.post('/upload', uploadMediaAsset, controller.upload);

// ─── TEMPORARILY COMMENTED OUT - Fix controller.remove ───
// router.post('/delete', controller.remove);

module.exports = router;