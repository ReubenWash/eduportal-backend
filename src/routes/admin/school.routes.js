const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

// Import the controller - use try-catch to handle potential import errors
let controller;
try {
  controller = require('../../controllers/admin/school.controller');
} catch (error) {
  console.error('Failed to load school.controller:', error.message);
  // Create a fallback controller with placeholder functions
  controller = {
    getAllSchools: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    getSchoolById: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    updateSchool: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    updateSchoolStatus: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    updateSchoolPlan: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    deleteSchool: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    restoreSchool: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    downloadRegistrationPdf: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    getSchoolStats: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    debugCheckSchool: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    debugGetStatus: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
    debugGetAllSchools: (req, res) => res.status(500).json({ success: false, message: 'Controller not loaded' }),
  };
}

// All admin school routes require authentication and SUPER_ADMIN role
router.use(authenticate, isSuperAdmin);

// ─── School Statistics ──
router.get('/stats/overview', controller.getSchoolStats);

// ─── Debug Endpoints (Remove in production) ──
router.get('/debug/check/:id', controller.debugCheckSchool);
router.get('/debug/status/:id', controller.debugGetStatus);
router.get('/debug/all', controller.debugGetAllSchools);

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