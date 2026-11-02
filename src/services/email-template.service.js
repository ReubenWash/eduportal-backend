const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const transporter = require("../config/email");
const { applyEmailLayout } = require("../utils/emailLayout");

const templateBody = ({ label, title, copy, details = "", actionLabel, actionUrl, note = "" }) => `
  <div style="padding:36px 32px 32px;font-family:Arial,Helvetica,sans-serif;color:#243247;">
    <p style="margin:0 0 10px;color:#527093;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;">${label}</p>
    <h1 style="margin:0 0 16px;color:#18324f;font-size:26px;line-height:1.25;font-weight:700;">${title}</h1>
    <div style="color:#526174;font-size:15px;line-height:1.7;">${copy}</div>
    ${details ? `<div style="margin:24px 0;padding:18px 20px;background:#f6f8fb;border:1px solid #e3eaf2;border-radius:8px;color:#34445a;font-size:14px;line-height:1.8;">${details}</div>` : ""}
    ${actionLabel && actionUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px;"><tr><td align="center" bgcolor="#1e3a5f" style="border-radius:6px;"><a href="${actionUrl}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">${actionLabel}</a></td></tr></table>` : ""}
    ${note ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #e8edf3;color:#718096;font-size:12px;line-height:1.6;">${note}</p>` : ""}
  </div>`;

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
    html: applyEmailLayout(rendered.html),
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
      subject: 'Welcome to EduTrack JHS',
      isDefault: true,
      htmlContent: templateBody({
        label: 'Account access',
        title: 'Welcome, {{name}}',
        copy: '<p style="margin:0;">Your account is ready. Sign in to access {{school}} on EduTrack JHS.</p>',
        details: '<strong>Login email</strong><br>{{email}}<br><br><strong>Temporary password</strong><br>{{password}}',
        actionLabel: 'Sign in to your account',
        actionUrl: '{{loginLink}}',
        note: 'For your security, sign in and change your temporary password as soon as possible.'
      }),
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
      htmlContent: templateBody({
        label: 'Registration update',
        title: 'Your school is approved',
        copy: '<p style="margin:0;">Your school, <strong>{{school}}</strong>, has been approved. You can now sign in and begin managing your school community.</p>',
        actionLabel: 'Go to your portal',
        actionUrl: '{{loginLink}}',
        note: 'If you need help getting started, contact the EduTrack JHS support team.'
      }),
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
      htmlContent: templateBody({
        label: 'Registration update',
        title: 'An update on your registration',
        copy: '<p style="margin:0;">We were unable to approve the registration for <strong>{{school}}</strong> at this time.</p>',
        details: '<strong>Reason provided</strong><br>{{reason}}',
        note: 'If you have questions or believe this decision was made in error, please contact support.'
      }),
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
      htmlContent: templateBody({
        label: 'Account security',
        title: 'Reset your password',
        copy: '<p style="margin:0;">Hello {{name}}, we received a request to reset the password for your account.</p>',
        actionLabel: 'Reset password',
        actionUrl: '{{resetLink}}',
        note: 'This link expires in {{expiry}} minutes. If you did not request a password reset, you can safely ignore this email.'
      }),
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
      htmlContent: templateBody({
        label: 'Payment confirmation',
        title: 'Payment received',
        copy: '<p style="margin:0;">Thank you. Your payment has been received and recorded.</p>',
        details: '<strong>Invoice</strong><br>{{invoiceNumber}}<br><br><strong>Amount</strong><br>{{amount}}<br><br><strong>Plan</strong><br>{{plan}}<br><br><strong>Date</strong><br>{{date}}',
        actionLabel: 'Download receipt',
        actionUrl: '{{receiptUrl}}'
      }),
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
      htmlContent: templateBody({
        label: 'Subscription reminder',
        title: 'Your subscription is ending soon',
        copy: '<p style="margin:0;">The subscription for <strong>{{school}}</strong> is scheduled to expire on <strong>{{expiryDate}}</strong>. Renew before then to maintain uninterrupted access.</p>',
        actionLabel: 'Review subscription',
        actionUrl: '{{renewLink}}',
        note: 'Contact support if you have questions about your subscription.'
      }),
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
      htmlContent: templateBody({
        label: 'Support update',
        title: 'There is a reply to your ticket',
        copy: '<p style="margin:0;">Hello {{name}}, our support team has responded to your request.</p>',
        details: '<strong>Ticket {{ticketNumber}}</strong><br>{{reply}}',
        actionLabel: 'View support ticket',
        actionUrl: '{{ticketLink}}'
      }),
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