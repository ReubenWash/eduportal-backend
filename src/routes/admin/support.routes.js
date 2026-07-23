const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/support.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

// ── Tickets ──
router.get('/tickets', controller.getTickets);
router.get('/tickets/:id', controller.getTicketById);
router.post('/tickets', controller.createTicket);
router.patch('/tickets/:id', controller.updateTicket);
router.post('/tickets/:id/messages', controller.addTicketMessage);
router.post('/tickets/:id/assign', controller.assignTicket);
router.post('/tickets/:id/resolve', controller.resolveTicket);
router.post('/tickets/:id/close', controller.closeTicket);

// ── Feedback ──
router.get('/feedback', controller.getFeedback);
router.post('/feedback', controller.createFeedback);
router.post('/feedback/:id/reply', controller.replyToFeedback);
router.post('/feedback/:id/helpful', controller.markFeedbackHelpful);

// ── Knowledge Base ──
router.get('/knowledge', controller.getKnowledgeArticles);
router.get('/knowledge/:slug', controller.getKnowledgeArticle);
router.post('/knowledge', controller.createKnowledgeArticle);
router.patch('/knowledge/:id', controller.updateKnowledgeArticle);
router.delete('/knowledge/:id', controller.deleteKnowledgeArticle);
router.post('/knowledge/:id/helpful', controller.markArticleHelpful);

module.exports = router;