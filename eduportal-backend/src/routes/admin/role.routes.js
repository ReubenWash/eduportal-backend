const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/role.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

router.get('/permissions', controller.getPermissionCatalogue);
router.get('/',            controller.getRoles);
router.post('/',           controller.createRole);
router.patch('/:id',       controller.updateRole);
router.delete('/:id',      controller.deleteRole);

module.exports = router;
