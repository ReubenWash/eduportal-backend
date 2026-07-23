const cmsService = require("../../services/cms.service");
const legalService = require("../../services/legal.service");
const emailTemplateService = require("../../services/email-template.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// CMS PAGES
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/cms/pages
const getPages = async (req, res) => {
  const result = await cmsService.getPages(req.query);
  return sendSuccess(res, 200, "Pages fetched", result);
};

// GET /api/v1/admin/cms/pages/:id
const getPageById = async (req, res) => {
  const page = await cmsService.getPageById(req.params.id);
  return sendSuccess(res, 200, "Page fetched", page);
};

// GET /api/v1/admin/cms/pages/slug/:slug
const getPageBySlug = async (req, res) => {
  const page = await cmsService.getPageBySlug(req.params.slug);
  return sendSuccess(res, 200, "Page fetched", page);
};

// GET /api/v1/admin/cms/pages/homepage
const getHomepage = async (req, res) => {
  const page = await cmsService.getHomepage();
  return sendSuccess(res, 200, "Homepage fetched", page);
};

// POST /api/v1/admin/cms/pages
const createPage = async (req, res) => {
  const { title, slug, content, metaTitle, metaDescription, ogImage, isHomepage } = req.body;

  if (!title || !slug) {
    throw createError("Title and slug are required", 400);
  }

  const page = await cmsService.createPage({
    title,
    slug,
    content,
    metaTitle,
    metaDescription,
    ogImage,
    isHomepage,
    userId: req.user.userId
  });

  return sendSuccess(res, 201, "Page created", page);
};

// PATCH /api/v1/admin/cms/pages/:id
const updatePage = async (req, res) => {
  const { title, slug, content, metaTitle, metaDescription, ogImage, status, isHomepage } = req.body;

  const page = await cmsService.updatePage(req.params.id, {
    title,
    slug,
    content,
    metaTitle,
    metaDescription,
    ogImage,
    status,
    isHomepage,
    userId: req.user.userId
  });

  return sendSuccess(res, 200, "Page updated", page);
};

// POST /api/v1/admin/cms/pages/:id/publish
const publishPage = async (req, res) => {
  const page = await cmsService.publishPage(req.params.id, req.user.userId);
  return sendSuccess(res, 200, "Page published", page);
};

// POST /api/v1/admin/cms/pages/:id/unpublish
const unpublishPage = async (req, res) => {
  const page = await cmsService.unpublishPage(req.params.id, req.user.userId);
  return sendSuccess(res, 200, "Page unpublished", page);
};

// DELETE /api/v1/admin/cms/pages/:id
const deletePage = async (req, res) => {
  await cmsService.deletePage(req.params.id, req.user.userId);
  return sendSuccess(res, 200, "Page deleted");
};

// ─────────────────────────────────────────────────────
// CMS SECTIONS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/cms/sections
const getSections = async (req, res) => {
  const sections = await cmsService.getSections(req.query);
  return sendSuccess(res, 200, "Sections fetched", sections);
};

// GET /api/v1/admin/cms/sections/:id
const getSectionById = async (req, res) => {
  const section = await cmsService.getSectionById(req.params.id);
  return sendSuccess(res, 200, "Section fetched", section);
};

// POST /api/v1/admin/cms/sections
const createSection = async (req, res) => {
  const { pageId, type, title, subtitle, content, order, isActive, settings } = req.body;

  if (!pageId || !type) {
    throw createError("Page ID and type are required", 400);
  }

  const section = await cmsService.createSection({
    pageId,
    type,
    title,
    subtitle,
    content,
    order,
    isActive,
    settings,
    userId: req.user.userId
  });

  return sendSuccess(res, 201, "Section created", section);
};

// PATCH /api/v1/admin/cms/sections/:id
const updateSection = async (req, res) => {
  const { title, subtitle, content, order, isActive, settings } = req.body;

  const section = await cmsService.updateSection(req.params.id, {
    title,
    subtitle,
    content,
    order,
    isActive,
    settings
  });

  return sendSuccess(res, 200, "Section updated", section);
};

// DELETE /api/v1/admin/cms/sections/:id
const deleteSection = async (req, res) => {
  await cmsService.deleteSection(req.params.id);
  return sendSuccess(res, 200, "Section deleted");
};

// POST /api/v1/admin/cms/sections/reorder
const reorderSections = async (req, res) => {
  const { pageId, sectionOrders } = req.body;

  if (!pageId || !sectionOrders) {
    throw createError("Page ID and section orders are required", 400);
  }

  await cmsService.reorderSections(pageId, sectionOrders);
  return sendSuccess(res, 200, "Sections reordered");
};

// ─────────────────────────────────────────────────────
// LEGAL DOCUMENTS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/cms/legal
const getLegalDocuments = async (req, res) => {
  const documents = await legalService.getLegalDocuments(req.query);
  return sendSuccess(res, 200, "Legal documents fetched", documents);
};

// GET /api/v1/admin/cms/legal/:id
const getLegalDocumentById = async (req, res) => {
  const document = await legalService.getLegalDocumentById(req.params.id);
  return sendSuccess(res, 200, "Legal document fetched", document);
};

// POST /api/v1/admin/cms/legal
const createLegalDocument = async (req, res) => {
  const { type, title, content, version, isActive, isPublished } = req.body;

  if (!type || !title || !content || !version) {
    throw createError("Type, title, content, and version are required", 400);
  }

  const document = await legalService.createLegalDocument({
    type,
    title,
    content,
    version,
    isActive,
    isPublished
  });

  return sendSuccess(res, 201, "Legal document created", document);
};

// PATCH /api/v1/admin/cms/legal/:id
const updateLegalDocument = async (req, res) => {
  const { title, content, isActive, isPublished } = req.body;

  const document = await legalService.updateLegalDocument(req.params.id, {
    title,
    content,
    isActive,
    isPublished
  });

  return sendSuccess(res, 200, "Legal document updated", document);
};

// DELETE /api/v1/admin/cms/legal/:id
const deleteLegalDocument = async (req, res) => {
  await legalService.deleteLegalDocument(req.params.id);
  return sendSuccess(res, 200, "Legal document deleted");
};

// GET /api/v1/admin/cms/legal/consent-logs
const getConsentLogs = async (req, res) => {
  const result = await legalService.getConsentLogs(req.query);
  return sendSuccess(res, 200, "Consent logs fetched", result);
};

// ─────────────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/cms/email-templates
const getEmailTemplates = async (req, res) => {
  const templates = await emailTemplateService.getTemplates(req.query);
  return sendSuccess(res, 200, "Email templates fetched", templates);
};

// GET /api/v1/admin/cms/email-templates/:id
const getEmailTemplateById = async (req, res) => {
  const template = await emailTemplateService.getTemplateById(req.params.id);
  return sendSuccess(res, 200, "Email template fetched", template);
};

// POST /api/v1/admin/cms/email-templates
const createEmailTemplate = async (req, res) => {
  const { key, name, subject, htmlContent, textContent, description, isActive, variables } = req.body;

  if (!key || !name || !subject || !htmlContent) {
    throw createError("Key, name, subject, and HTML content are required", 400);
  }

  const template = await emailTemplateService.createTemplate({
    key,
    name,
    subject,
    htmlContent,
    textContent,
    description,
    isActive,
    variables
  });

  return sendSuccess(res, 201, "Email template created", template);
};

// PATCH /api/v1/admin/cms/email-templates/:id
const updateEmailTemplate = async (req, res) => {
  const { name, subject, htmlContent, textContent, description, isActive, variables } = req.body;

  const template = await emailTemplateService.updateTemplate(req.params.id, {
    name,
    subject,
    htmlContent,
    textContent,
    description,
    isActive,
    variables
  });

  return sendSuccess(res, 200, "Email template updated", template);
};

// DELETE /api/v1/admin/cms/email-templates/:id
const deleteEmailTemplate = async (req, res) => {
  await emailTemplateService.deleteTemplate(req.params.id);
  return sendSuccess(res, 200, "Email template deleted");
};

// POST /api/v1/admin/cms/email-templates/:id/test
const sendTestEmail = async (req, res) => {
  const { email, variables } = req.body;

  if (!email) {
    throw createError("Email address is required", 400);
  }

  await emailTemplateService.sendTestEmail(req.params.id, email, variables);
  return sendSuccess(res, 200, "Test email sent successfully");
};

// POST /api/v1/admin/cms/email-templates/seed
const seedEmailTemplates = async (req, res) => {
  await emailTemplateService.seedDefaultTemplates();
  return sendSuccess(res, 200, "Default email templates seeded");
};

module.exports = {
  // Pages
  getPages,
  getPageById,
  getPageBySlug,
  getHomepage,
  createPage,
  updatePage,
  publishPage,
  unpublishPage,
  deletePage,
  
  // Sections
  getSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  
  // Legal
  getLegalDocuments,
  getLegalDocumentById,
  createLegalDocument,
  updateLegalDocument,
  deleteLegalDocument,
  getConsentLogs,
  
  // Email Templates
  getEmailTemplates,
  getEmailTemplateById,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  sendTestEmail,
  seedEmailTemplates
};