const supportService = require("../../services/support.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// TICKETS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/support/tickets
const getTickets = async (req, res) => {
  const result = await supportService.getTickets(req.query);
  return sendSuccess(res, 200, "Tickets fetched", result);
};

// GET /api/v1/admin/support/tickets/:id
const getTicketById = async (req, res) => {
  const ticket = await supportService.getTicketById(req.params.id);
  return sendSuccess(res, 200, "Ticket fetched", ticket);
};

// POST /api/v1/admin/support/tickets
const createTicket = async (req, res) => {
  const { schoolId, userId, subject, description, priority, category, assignedTo } = req.body;

  if (!userId || !subject || !description) {
    throw createError("User ID, subject, and description are required", 400);
  }

  const ticket = await supportService.createTicket({
    schoolId,
    userId,
    subject,
    description,
    priority,
    category,
    assignedTo
  });

  return sendSuccess(res, 201, "Ticket created", ticket);
};

// PATCH /api/v1/admin/support/tickets/:id
const updateTicket = async (req, res) => {
  const { status, priority, assignedTo, subject, description } = req.body;
  
  const ticket = await supportService.updateTicket(req.params.id, {
    status,
    priority,
    assignedTo,
    subject,
    description
  });

  return sendSuccess(res, 200, "Ticket updated", ticket);
};

// POST /api/v1/admin/support/tickets/:id/messages
const addTicketMessage = async (req, res) => {
  const { userId, message, isInternal, attachments } = req.body;

  if (!userId || !message) {
    throw createError("User ID and message are required", 400);
  }

  const ticketMessage = await supportService.addTicketMessage(req.params.id, {
    userId,
    message,
    isInternal,
    attachments
  });

  return sendSuccess(res, 201, "Message added", ticketMessage);
};

// POST /api/v1/admin/support/tickets/:id/assign
const assignTicket = async (req, res) => {
  const { assigneeId } = req.body;

  if (!assigneeId) {
    throw createError("Assignee ID is required", 400);
  }

  const ticket = await supportService.assignTicket(req.params.id, assigneeId);
  return sendSuccess(res, 200, "Ticket assigned", ticket);
};

// POST /api/v1/admin/support/tickets/:id/resolve
const resolveTicket = async (req, res) => {
  const { rating, ratingComment } = req.body;

  const ticket = await supportService.resolveTicket(req.params.id, rating, ratingComment);
  return sendSuccess(res, 200, "Ticket resolved", ticket);
};

// POST /api/v1/admin/support/tickets/:id/close
const closeTicket = async (req, res) => {
  const ticket = await supportService.closeTicket(req.params.id);
  return sendSuccess(res, 200, "Ticket closed", ticket);
};

// ─────────────────────────────────────────────────────
// FEEDBACK
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/support/feedback
const getFeedback = async (req, res) => {
  const result = await supportService.getFeedback(req.query);
  return sendSuccess(res, 200, "Feedback fetched", result);
};

// POST /api/v1/admin/support/feedback
const createFeedback = async (req, res) => {
  const { schoolId, userId, rating, comment, category, isPublic } = req.body;

  if (!schoolId || rating === undefined) {
    throw createError("School ID and rating are required", 400);
  }

  const feedback = await supportService.createFeedback({
    schoolId,
    userId,
    rating,
    comment,
    category,
    isPublic
  });

  return sendSuccess(res, 201, "Feedback created", feedback);
};

// POST /api/v1/admin/support/feedback/:id/reply
const replyToFeedback = async (req, res) => {
  const { userId, reply, isPublic } = req.body;

  if (!userId || !reply) {
    throw createError("User ID and reply are required", 400);
  }

  const feedbackReply = await supportService.replyToFeedback(req.params.id, {
    userId,
    reply,
    isPublic
  });

  return sendSuccess(res, 201, "Reply added", feedbackReply);
};

// POST /api/v1/admin/support/feedback/:id/helpful
const markFeedbackHelpful = async (req, res) => {
  const { helpful } = req.body;

  if (helpful === undefined) {
    throw createError("Helpful flag is required", 400);
  }

  const feedback = await supportService.markFeedbackHelpful(req.params.id, helpful);
  return sendSuccess(res, 200, "Feedback marked", feedback);
};

// ─────────────────────────────────────────────────────
// KNOWLEDGE BASE / FAQ
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/support/knowledge
const getKnowledgeArticles = async (req, res) => {
  const result = await supportService.getKnowledgeArticles(req.query);
  return sendSuccess(res, 200, "Articles fetched", result);
};

// GET /api/v1/admin/support/knowledge/:slug
const getKnowledgeArticle = async (req, res) => {
  const article = await supportService.getKnowledgeArticle(req.params.slug);
  return sendSuccess(res, 200, "Article fetched", article);
};

// POST /api/v1/admin/support/knowledge
const createKnowledgeArticle = async (req, res) => {
  const { title, content, category, tags, isPublished } = req.body;

  if (!title || !content) {
    throw createError("Title and content are required", 400);
  }

  const article = await supportService.createKnowledgeArticle({
    title,
    content,
    category,
    tags,
    isPublished
  });

  return sendSuccess(res, 201, "Article created", article);
};

// PATCH /api/v1/admin/support/knowledge/:id
const updateKnowledgeArticle = async (req, res) => {
  const { title, content, category, tags, isPublished } = req.body;

  const article = await supportService.updateKnowledgeArticle(req.params.id, {
    title,
    content,
    category,
    tags,
    isPublished
  });

  return sendSuccess(res, 200, "Article updated", article);
};

// DELETE /api/v1/admin/support/knowledge/:id
const deleteKnowledgeArticle = async (req, res) => {
  await supportService.deleteKnowledgeArticle(req.params.id);
  return sendSuccess(res, 200, "Article deleted");
};

// POST /api/v1/admin/support/knowledge/:id/helpful
const markArticleHelpful = async (req, res) => {
  const { helpful } = req.body;

  if (helpful === undefined) {
    throw createError("Helpful flag is required", 400);
  }

  const article = await supportService.markArticleHelpful(req.params.id, helpful);
  return sendSuccess(res, 200, "Article marked", article);
};

module.exports = {
  // Tickets
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  addTicketMessage,
  assignTicket,
  resolveTicket,
  closeTicket,
  
  // Feedback
  getFeedback,
  createFeedback,
  replyToFeedback,
  markFeedbackHelpful,
  
  // Knowledge Base
  getKnowledgeArticles,
  getKnowledgeArticle,
  createKnowledgeArticle,
  updateKnowledgeArticle,
  deleteKnowledgeArticle,
  markArticleHelpful
};