const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const transporter = require("../config/email");

// ─────────────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────────────

const getTemplates = async (query) => {
  const { isActive, search } = query;

  const where = {};
  if (isActive !== undefined) where.isActive = isActive === 'true';
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { key: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ];
  }

  const templates = await prisma.emailTemplate.findMany({
    where,
    orderBy: { name: 'asc' }
  });

  return templates;
};

const getTemplateById = async (id) => {
  const template = await prisma.emailTemplate.findUnique({
    where: { id }
  });

  if (!template) {
    throw createError('Email template not found', 404);
  }

  return template;
};

const getTemplateByKey = async (key) => {
  const template = await prisma.emailTemplate.findUnique({
    where: { key }
  });

  if (!template) {
    throw createError('Email template not found', 404);
  }

  return template;
};

const createTemplate = async (data) => {
  const { key, name, subject, htmlContent, textContent, description, isActive = true, variables } = data;

  if (!key || !name || !subject || !htmlContent) {
    throw createError('Key, name, subject, and HTML content are required', 400);
  }

  // Check for duplicate key
  const existing = await prisma.emailTemplate.findUnique({
    where: { key }
  });

  if (existing) {
    throw createError('Template with this key already exists', 409);
  }

  const template = await prisma.emailTemplate.create({
    data: {
      key,
      name,
      subject,
      htmlContent,
      textContent: textContent || null,
      description: description || null,
      isActive,
      variables: variables || null
    }
  });

  return template;
};

const updateTemplate = async (id, data) => {
  const { name, subject, htmlContent, textContent, description, isActive, variables } = data;

  const template = await prisma.emailTemplate.findUnique({
    where: { id }
  });

  if (!template) {
    throw createError('Email template not found', 404);
  }

  const updateData = {};
  if (name) updateData.name = name;
  if (subject) updateData.subject = subject;
  if (htmlContent) updateData.htmlContent = htmlContent;
  if (textContent !== undefined) updateData.textContent = textContent;
  if (description !== undefined) updateData.description = description;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (variables !== undefined) updateData.variables = variables;

  const updated = await prisma.emailTemplate.update({
    where: { id },
    data: updateData
  });

  return updated;
};

const deleteTemplate = async (id) => {
  const template = await prisma.emailTemplate.findUnique({
    where: { id }
  });

  if (!template) {
    throw createError('Email template not found', 404);
  }

  if (template.isDefault) {
    throw createError('Cannot delete a default template', 400);
  }

  await prisma.emailTemplate.delete({
    where: { id }
  });

  return { message: 'Template deleted successfully' };
};

const renderTemplate = (template, variables) => {
  let html = template.htmlContent;
  let text = template.textContent || '';

  // Replace placeholders
  Object.keys(variables).forEach(key => {
    const value = variables[key] || '';
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
    text = text.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });

  return { html, text };
};

const sendTestEmail = async (templateId, email, variables) => {
  const template = await prisma.emailTemplate.findUnique({
    where: { id: templateId }
  });

  if (!template) {
    throw createError('Email template not found', 404);
  }

  const rendered = renderTemplate(template, variables || { test: 'Test Email' });

  await transporter.sendMail({
    to: email,
    subject: `[TEST] ${template.subject}`,
    html: rendered.html,
    text: rendered.text
  });

  return { message: 'Test email sent successfully' };
};

// ─────────────────────────────────────────────────────
// SEED DEFAULT TEMPLATES
// ─────────────────────────────────────────────────────

const seedDefaultTemplates = async () => {
  const defaultTemplates = [
    {
      key: 'welcome_email',
      name: 'Welcome Email',
      subject: 'Welcome to EduPortal!',
      isDefault: true,
      htmlContent: `
        <h1>Welcome {{name}}!</h1>
        <p>Your account has been created at {{school}}.</p>
        <p>Email: {{email}}</p>
        <p>Password: {{password}}</p>
        <p><a href="{{loginLink}}">Login Here</a></p>
      `,
      description: 'Sent when a new user is created',
      variables: [
        { name: 'name', description: 'User\'s full name', example: 'John Doe' },
        { name: 'email', description: 'User\'s email', example: 'john@school.edu' },
        { name: 'password', description: 'Temporary password', example: 'Temp@123' },
        { name: 'school', description: 'School name', example: 'Sunshine Academy' },
        { name: 'loginLink', description: 'Login URL', example: 'https://app.eduportal.com/login' }
      ]
    },
    {
      key: 'school_approved',
      name: 'School Approved',
      subject: 'Your school has been approved!',
      isDefault: true,
      htmlContent: `
        <h1>Congratulations!</h1>
        <p>Your school <strong>{{school}}</strong> has been approved.</p>
        <p>You can now log in and start managing your school.</p>
        <p><a href="{{loginLink}}">Login Here</a></p>
      `,
      description: 'Sent when a school registration is approved',
      variables: [
        { name: 'school', description: 'School name', example: 'Sunshine Academy' },
        { name: 'loginLink', description: 'Login URL', example: 'https://app.eduportal.com/login' }
      ]
    },
    {
      key: 'school_rejected',
      name: 'School Rejected',
      subject: 'School registration update',
      isDefault: true,
      htmlContent: `
        <h1>Registration Update</h1>
        <p>Your school <strong>{{school}}</strong> registration was not approved.</p>
        <p>Reason: {{reason}}</p>
        <p>Please contact support if you have questions.</p>
      `,
      description: 'Sent when a school registration is rejected',
      variables: [
        { name: 'school', description: 'School name', example: 'Sunshine Academy' },
        { name: 'reason', description: 'Rejection reason', example: 'Missing documents' }
      ]
    },
    {
      key: 'password_reset',
      name: 'Password Reset',
      subject: 'Reset your password',
      isDefault: true,
      htmlContent: `
        <h1>Password Reset</h1>
        <p>Hi {{name}},</p>
        <p>Click the link below to reset your password.</p>
        <p><a href="{{resetLink}}">Reset Password</a></p>
        <p>This link expires in {{expiry}} minutes.</p>
      `,
      description: 'Sent when a user requests password reset',
      variables: [
        { name: 'name', description: 'User\'s name', example: 'John Doe' },
        { name: 'resetLink', description: 'Reset password URL', example: 'https://app.eduportal.com/reset/123' },
        { name: 'expiry', description: 'Expiry in minutes', example: '60' }
      ]
    },
    {
      key: 'payment_receipt',
      name: 'Payment Receipt',
      subject: 'Payment Receipt - {{invoiceNumber}}',
      isDefault: true,
      htmlContent: `
        <h1>Payment Receipt</h1>
        <p>Thank you for your payment.</p>
        <p><strong>Invoice:</strong> {{invoiceNumber}}</p>
        <p><strong>Amount:</strong> {{amount}}</p>
        <p><strong>Plan:</strong> {{plan}}</p>
        <p><strong>Date:</strong> {{date}}</p>
        <p><a href="{{receiptUrl}}">Download Receipt</a></p>
      `,
      description: 'Sent when a payment is received',
      variables: [
        { name: 'invoiceNumber', description: 'Invoice number', example: 'INV-001' },
        { name: 'amount', description: 'Payment amount', example: '$199.00' },
        { name: 'plan', description: 'Subscription plan', example: 'Standard' },
        { name: 'date', description: 'Payment date', example: '2025-01-15' },
        { name: 'receiptUrl', description: 'Receipt download URL', example: 'https://app.eduportal.com/receipt/INV-001' }
      ]
    },
    {
      key: 'subscription_expiry',
      name: 'Subscription Expiry',
      subject: 'Your subscription is expiring soon',
      isDefault: true,
      htmlContent: `
        <h1>Subscription Expiry Reminder</h1>
        <p>Your subscription for <strong>{{school}}</strong> will expire on <strong>{{expiryDate}}</strong>.</p>
        <p>Renew now to continue using all features.</p>
        <p><a href="{{renewLink}}">Renew Subscription</a></p>
      `,
      description: 'Sent when a subscription is about to expire',
      variables: [
        { name: 'school', description: 'School name', example: 'Sunshine Academy' },
        { name: 'expiryDate', description: 'Expiry date', example: '2025-02-15' },
        { name: 'renewLink', description: 'Renewal URL', example: 'https://app.eduportal.com/billing' }
      ]
    },
    {
      key: 'ticket_reply',
      name: 'Ticket Reply',
      subject: 'Support Ticket Update - {{ticketNumber}}',
      isDefault: true,
      htmlContent: `
        <h1>Support Ticket Update</h1>
        <p>Hi {{name}},</p>
        <p>There is a new reply to your support ticket:</p>
        <p><strong>Ticket:</strong> {{ticketNumber}}</p>
        <p><strong>Reply:</strong> {{reply}}</p>
        <p><a href="{{ticketLink}}">View Ticket</a></p>
      `,
      description: 'Sent when a support ticket is updated',
      variables: [
        { name: 'name', description: 'User\'s name', example: 'John Doe' },
        { name: 'ticketNumber', description: 'Ticket number', example: 'TKT-001' },
        { name: 'reply', description: 'Reply message', example: 'We are looking into this issue...' },
        { name: 'ticketLink', description: 'Ticket URL', example: 'https://app.eduportal.com/support/TKT-001' }
      ]
    }
  ];

  for (const template of defaultTemplates) {
    await prisma.emailTemplate.upsert({
      where: { key: template.key },
      update: template,
      create: template
    });
  }
};

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

module.exports = {
  getTemplates,
  getTemplateById,
  getTemplateByKey,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  renderTemplate,
  sendTestEmail,
  seedDefaultTemplates
};