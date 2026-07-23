const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/media.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');
const { uploadMediaAsset } = require('../../middleware/upload');

router.use(authenticate, isSuperAdmin);

router.get('/',        controller.list);
router.post('/upload', uploadMediaAsset, controller.upload);
router.post('/delete', controller.remove);

module.exports = router;
