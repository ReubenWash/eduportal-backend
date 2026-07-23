const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/cms.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

// ── Pages ──
router.get('/pages', controller.getPages);
router.get('/pages/homepage', controller.getHomepage);
router.get('/pages/slug/:slug', controller.getPageBySlug);
router.get('/pages/:id', controller.getPageById);
router.post('/pages', controller.createPage);
router.patch('/pages/:id', controller.updatePage);
router.post('/pages/:id/publish', controller.publishPage);
router.post('/pages/:id/unpublish', controller.unpublishPage);
router.delete('/pages/:id', controller.deletePage);

// ── Sections ──
router.get('/sections', controller.getSections);
router.get('/sections/:id', controller.getSectionById);
router.post('/sections', controller.createSection);
router.patch('/sections/:id', controller.updateSection);
router.delete('/sections/:id', controller.deleteSection);
router.post('/sections/reorder', controller.reorderSections);

// ── Legal Documents ──
router.get('/legal', controller.getLegalDocuments);
router.get('/legal/consent-logs', controller.getConsentLogs);
router.get('/legal/:id', controller.getLegalDocumentById);
router.post('/legal', controller.createLegalDocument);
router.patch('/legal/:id', controller.updateLegalDocument);
router.delete('/legal/:id', controller.deleteLegalDocument);

// ── Email Templates ──
router.get('/email-templates', controller.getEmailTemplates);
router.get('/email-templates/:id', controller.getEmailTemplateById);
router.post('/email-templates', controller.createEmailTemplate);
router.patch('/email-templates/:id', controller.updateEmailTemplate);
router.delete('/email-templates/:id', controller.deleteEmailTemplate);
router.post('/email-templates/:id/test', controller.sendTestEmail);
router.post('/email-templates/seed', controller.seedEmailTemplates);

module.exports = router;