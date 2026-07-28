const cmsService = require("../../services/cms.service");
const legalService = require("../../services/legal.service");
const emailTemplateService = require("../../services/email-template.service");
const { prisma } = require("../../config/db");
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

// PATCH /api/v1/admin/cms/sections/:id/content
const updateSectionContent = async (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== 'object') {
    throw createError("Content is required", 400);
  }

  const section = await cmsService.updateSectionContent(req.params.id, content);
  return sendSuccess(res, 200, "Section content updated", section);
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
// LANDING PAGE CONTENT
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/cms/landing
const getLandingContent = async (req, res) => {
  const content = await cmsService.getLandingContent();
  return sendSuccess(res, 200, "Landing content fetched", content);
};

// PUT /api/v1/admin/cms/landing
const saveLandingContent = async (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== 'object') {
    throw createError("Content is required", 400);
  }

  const result = await cmsService.saveLandingContent(content, req.user.userId);
  return sendSuccess(res, 200, "Landing content saved successfully", result);
};

// PATCH /api/v1/admin/cms/landing/section/:type
const updateLandingSection = async (req, res) => {
  const { type } = req.params;
  const { content } = req.body;

  if (!content || typeof content !== 'object') {
    throw createError("Content is required", 400);
  }

  const section = await cmsService.updateLandingSection(type, content, req.user.userId);
  return sendSuccess(res, 200, `${type} section updated successfully`, section);
};

// ─────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/cms/footer
const getFooter = async (req, res) => {
  const footer = await cmsService.getFooter();
  return sendSuccess(res, 200, "Footer fetched", footer);
};

// PATCH /api/v1/admin/cms/footer
const updateFooter = async (req, res) => {
  const { tagline, links, socialLinks, copyright } = req.body;

  // Find or create footer section
  const sections = await cmsService.getSections({ type: 'FOOTER' });
  let footerSection = sections.find(s => s.type === 'FOOTER');

  const footerContent = { tagline, links, socialLinks, copyright };

  if (!footerSection) {
    // Create footer section if it doesn't exist
    const homepage = await cmsService.getHomepage();
    if (!homepage) {
      throw createError("Homepage not found. Please create a homepage first.", 404);
    }
    
    footerSection = await cmsService.createSection({
      pageId: homepage.id,
      type: 'FOOTER',
      title: 'Footer',
      content: footerContent,
      isActive: true,
      userId: req.user.userId
    });
  } else {
    // Update existing footer
    footerSection = await cmsService.updateSectionContent(footerSection.id, footerContent);
  }

  return sendSuccess(res, 200, "Footer updated successfully", footerSection);
};

// ─────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/cms/theme
const getTheme = async (req, res) => {
  const theme = await prisma.systemSetting.findUnique({
    where: { key: 'theme_config' }
  });

  const defaultTheme = {
    primaryColor: '#4F46E5',
    secondaryColor: '#1A3C5E',
    accentColor: '#F59E0B',
    fontFamily: 'Inter',
    borderRadius: '8px',
    buttonStyle: 'rounded',
    logoUrl: null,
    faviconUrl: null,
    customCss: ''
  };

  return sendSuccess(res, 200, "Theme fetched", theme?.value || defaultTheme);
};

// PATCH /api/v1/admin/cms/theme
const updateTheme = async (req, res) => {
  const { 
    primaryColor, 
    secondaryColor, 
    accentColor,
    fontFamily, 
    borderRadius,
    buttonStyle, 
    logoUrl, 
    faviconUrl,
    customCss
  } = req.body;

  const themeSettings = {
    primaryColor: primaryColor || '#4F46E5',
    secondaryColor: secondaryColor || '#1A3C5E',
    accentColor: accentColor || '#F59E0B',
    fontFamily: fontFamily || 'Inter',
    borderRadius: borderRadius || '8px',
    buttonStyle: buttonStyle || 'rounded',
    logoUrl: logoUrl || null,
    faviconUrl: faviconUrl || null,
    customCss: customCss || ''
  };

  // Store in system settings
  const updated = await prisma.systemSetting.upsert({
    where: { key: 'theme_config' },
    update: { 
      value: themeSettings,
      updatedAt: new Date()
    },
    create: { 
      key: 'theme_config', 
      value: themeSettings,
      category: 'BRANDING',
      description: 'Platform theme configuration'
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: req.user.userId,
      action: 'CONFIG_UPDATE',
      resource: 'SYSTEM_SETTING',
      resourceId: updated.id,
      metadata: { theme: themeSettings }
    }
  });

  return sendSuccess(res, 200, "Theme updated successfully", themeSettings);
};

// ─────────────────────────────────────────────────────
// CMS SETTINGS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/cms/settings
const getCmsSettings = async (req, res) => {
  const settings = await prisma.systemSetting.findMany({
    where: {
      category: 'BRANDING',
      isPublic: true
    }
  });

  const settingsMap = {};
  settings.forEach(setting => {
    settingsMap[setting.key] = setting.value;
  });

  return sendSuccess(res, 200, "CMS settings fetched", settingsMap);
};

// PATCH /api/v1/admin/cms/settings
const updateCmsSettings = async (req, res) => {
  const { settings } = req.body;

  if (!settings || typeof settings !== 'object') {
    throw createError("Invalid settings data", 400);
  }

  const updates = [];
  for (const [key, value] of Object.entries(settings)) {
    const result = await prisma.systemSetting.upsert({
      where: { key },
      update: {
        value,
        updatedAt: new Date()
      },
      create: {
        key,
        value,
        category: 'BRANDING',
        isPublic: true
      }
    });
    updates.push(result);
  }

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: req.user.userId,
      action: 'CONFIG_UPDATE',
      resource: 'SYSTEM_SETTING',
      metadata: { updatedKeys: Object.keys(settings) }
    }
  });

  return sendSuccess(res, 200, "CMS settings updated successfully", updates);
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
  updateSectionContent,
  deleteSection,
  reorderSections,
  
  // Landing Page
  getLandingContent,
  saveLandingContent,
  updateLandingSection,
  
  // Footer
  getFooter,
  updateFooter,
  
  // Theme
  getTheme,
  updateTheme,
  
  // CMS Settings
  getCmsSettings,
  updateCmsSettings,
  
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