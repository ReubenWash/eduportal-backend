const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

// Import the controller
const controller = require('../../controllers/admin/school.controller');

// All admin school routes require authentication and SUPER_ADMIN role
router.use(authenticate, isSuperAdmin);

// ─── School Statistics ──
router.get('/stats/overview', controller.getSchoolStats);

// ─── School Management ──
router.get('/', controller.getAllSchools);
router.get('/:id', controller.getSchoolById);
router.patch('/:id', controller.updateSchool);
router.patch('/:id/status', controller.updateSchoolStatus);
router.patch('/:id/plan', controller.updateSchoolPlan);
router.delete('/:id', controller.deleteSchool);
router.post('/:id/restore', controller.restoreSchool);
router.get('/:id/registration-pdf', controller.downloadRegistrationPdf);

module.exports = router;