// backend/services/email.service.js
require("dotenv").config();
const axios = require("axios");
const logger = require("../config/logger");

const BREVO_API_URL = process.env.BREVO_API_URL || "https://api.brevo.com/v3";
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// ── Generic send helper using Brevo API ──────────────────────
const sendMail = async ({ to, subject, html }, retries = 2) => {
  try {
    console.log(`📧 Sending email via Brevo API to ${to}...`);
    
    const response = await axios.post(
      `${BREVO_API_URL}/smtp/email`,
      {
        sender: {
          name: process.env.BREVO_SENDER_NAME || "EduTrack JHS",
          email: process.env.BREVO_SENDER_EMAIL || "asiedureubenwash@gmail.com"
        },
        to: [{ email: to }],
        subject: subject,
        htmlContent: html,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': BREVO_API_KEY,
        },
        timeout: 30000,
      }
    );

    console.log(`✅ Email sent via Brevo API to ${to}`);
    logger.info(`Email sent to ${to} — ${subject}`);
    return response.data;
  } catch (error) {
    // If it's a timeout error and we have retries left, try again
    if (error.code === 'ECONNABORTED' && retries > 0) {
      console.log(`⏳ Retrying... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return sendMail({ to, subject, html }, retries - 1);
    }
    
    logger.error(`Failed to send email to ${to}:`, error.response?.data || error.message);
    console.error(`❌ Failed to send email to ${to}:`, error.response?.data || error.message);
    throw error;
  }
};

// ── Safe email sender that doesn't throw ──────────────────────
const sendMailSafe = async ({ to, subject, html }) => {
  try {
    return await sendMail({ to, subject, html });
  } catch (error) {
    console.error(`❌ Email failed (but continuing): ${error.message}`);
    return { success: false, error: error.message };
  }
};

// ── Email templates ────────────────────────────────────────────

// ─── 1. Verification Email ─────────────────────────────────────
const sendVerificationEmail = async (email, name, code) => {
  return sendMailSafe({
    to: email,
    subject: "Verify your EduTrack account",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">EduTrack JHS</h1>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:#1A3C5E;">Hello, ${name}!</h2>
          <p style="color:#444;line-height:1.6;">
            Thank you for registering your school on EduTrack JHS.
            Please use the verification code below to activate your account.
          </p>
          <div style="text-align:center;margin:32px 0;padding:20px;background:#f0f4ff;border-radius:8px;border:2px dashed #4F46E5;">
            <p style="font-size:36px;font-weight:bold;color:#4F46E5;letter-spacing:10px;margin:0;">
              ${code}
            </p>
          </div>
          <p style="color:#888;font-size:13px;text-align:center;">
            This code expires in <strong>24 hours</strong>.<br/>
            If you did not register, please ignore this email.
          </p>
          <p style="color:#999;font-size:12px;text-align:center;margin-top:20px;">
            Enter this code on the verification page to complete your registration.
          </p>
        </div>
      </div>`,
  });
};

// ─── 2. Password Reset Email ──────────────────────────────────
const sendPasswordResetEmail = async (email, name, token) => {
  const url = `${process.env.CLIENT_URL}/reset-password/${token}`;
  return sendMailSafe({
    to: email,
    subject: "Reset your EduTrack password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">EduTrack JHS</h1>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:#1A3C5E;">Password Reset</h2>
          <p style="color:#444;line-height:1.6;">Hi ${name}, we received a request to reset your password.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${url}"
               style="background:#E74C3C;color:#fff;padding:14px 32px;
                      border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
              Reset Password
            </a>
          </div>
          <p style="color:#888;font-size:13px;">
            This link expires in <strong>1 hour</strong>.<br/>
            If you did not request a password reset, please ignore this email.
          </p>
        </div>
      </div>`,
  });
};

// ─── 3. Welcome Staff Email ───────────────────────────────────
const sendWelcomeStaffEmail = async (email, name, tempPassword, schoolName) => {
  const loginUrl = `${process.env.CLIENT_URL}/login`;
  return sendMailSafe({
    to: email,
    subject: `Welcome to ${schoolName} on EduTrack JHS`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">EduTrack JHS</h1>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:#1A3C5E;">Welcome, ${name}!</h2>
          <p style="color:#444;line-height:1.6;">
            Your staff account has been created on <strong>${schoolName}</strong>.
          </p>
          <div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 8px;color:#444;"><strong>Login Email:</strong> ${email}</p>
            <p style="margin:0;color:#444;"><strong>Temporary Password:</strong>
              <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;">${tempPassword}</code>
            </p>
          </div>
          <p style="color:#888;font-size:13px;">
            Please log in and change your password immediately.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${loginUrl}"
               style="background:#2E75B6;color:#fff;padding:14px 32px;
                      border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
              Login to EduTrack
            </a>
          </div>
        </div>
      </div>`,
  });
};

// ─── 4. Welcome Guardian Email (NEW - for Parent Portal) ─────
const sendWelcomeGuardianEmail = async (email, name, tempPassword, schoolName) => {
  const loginUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/login`;
  return sendMailSafe({
    to: email,
    subject: `Welcome to ${schoolName || "Your School"} Parent Portal`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">${schoolName || "EduTrack JHS"}</h1>
          <p style="color:#A8C8E8;margin:4px 0 0;">Parent Portal Access</p>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:#1A3C5E;">Welcome, ${name}!</h2>
          <p style="color:#444;line-height:1.6;">
            Your parent portal account has been created for <strong>${schoolName || "your school"}</strong>.
            You can now log in to track your child's academic progress.
          </p>
          <div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 8px;color:#444;">
              <strong>Login Email:</strong> ${email}
            </p>
            <p style="margin:0;color:#444;">
              <strong>Temporary Password:</strong>
              <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:16px;font-weight:bold;">
                ${tempPassword}
              </code>
            </p>
          </div>
          <p style="color:#888;font-size:13px;">
            Please log in and change your password immediately.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${loginUrl}"
               style="background:#2E75B6;color:#fff;padding:14px 32px;
                      border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
              Login to Parent Portal
            </a>
          </div>
          <p style="color:#999;font-size:12px;margin-top:20px;border-top:1px solid #eee;padding-top:16px;">
            If you have any questions, please contact your school administrator.
          </p>
          <div style="background:#f8f9fa;border-radius:6px;padding:12px;margin-top:16px;border:1px solid #e9ecef;">
            <p style="color:#666;font-size:12px;margin:0;">
              <strong>💡 Tip:</strong> As a parent, you can view your child's:
            </p>
            <ul style="color:#666;font-size:12px;margin:8px 0 0 20px;padding:0;">
              <li>📊 Academic scores and grades</li>
              <li>📅 Daily attendance records</li>
              <li>📄 Report cards (when released)</li>
              <li>📢 School notifications</li>
            </ul>
          </div>
        </div>
      </div>`,
  });
};

// ─── 5. Report Card Email ─────────────────────────────────────
const sendReportCardEmail = async (email, parentName, studentName, term, pdfUrl, schoolName) => {
  return sendMailSafe({
    to: email,
    subject: `${studentName}'s ${term} Report Card — ${schoolName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">${schoolName}</h1>
          <p style="color:#A8C8E8;margin:4px 0 0;">Powered by EduTrack JHS</p>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:#1A3C5E;">Dear ${parentName},</h2>
          <p style="color:#444;line-height:1.6;">
            The <strong>${term}</strong> report card for <strong>${studentName}</strong>
            is now available. Click the button below to download it.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${pdfUrl}"
               style="background:#27AE60;color:#fff;padding:14px 32px;
                      border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
              Download Report Card
            </a>
          </div>
          <p style="color:#888;font-size:13px;">
            You can also view this report by logging into the parent portal.
          </p>
        </div>
      </div>`,
  });
};

// ─── 6. Registration Under Review Email ──────────────────────
const sendRegistrationUnderReviewEmail = async (email, name, schoolName) => {
  return sendMailSafe({
    to: email,
    subject: `Registration received: ${schoolName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">EduTrack JHS</h1>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:#1A3C5E;">Registration Under Review</h2>
          <p style="color:#444;line-height:1.6;">Hello ${name},</p>
          <p style="color:#444;line-height:1.6;">
            Thank you for registering <strong>${schoolName}</strong>. Your account registration has been received and is currently under review.
          </p>
          <p style="color:#444;line-height:1.6;">
            Our team will review your details shortly. You will be notified via email once your school account is approved and activated.
          </p>
          <p style="color:#888;font-size:13px;margin-top:20px;">
            Please make sure to verify your email using the code sent in the previous verification email.
          </p>
        </div>
      </div>`,
  });
};

// ─── 7. School Status Update Email ────────────────────────────
const sendSchoolStatusEmail = async (email, schoolName, status) => {
  let subject = "";
  let title = "";
  let content = "";
  let color = "#2E75B6";

  if (status === "ACTIVE") {
    subject = `Your school "${schoolName}" has been approved!`;
    title = "School Registration Approved";
    content = `We are pleased to inform you that your school registration for <strong>${schoolName}</strong> has been approved. You can now log into your account and begin setting up your classes, staff, and students.`;
    color = "#27AE60";
  } else if (status === "REJECTED") {
    subject = `Registration update for "${schoolName}"`;
    title = "School Registration Rejected";
    content = `We regret to inform you that your school registration for <strong>${schoolName}</strong> has been rejected. If you believe this is a mistake or have questions, please contact support.`;
    color = "#C0392B";
  } else if (status === "SUSPENDED") {
    subject = `Your school account "${schoolName}" has been suspended`;
    title = "School Account Suspended";
    content = `Your school account for <strong>${schoolName}</strong> has been suspended. Users will not be able to log in. Please contact support to resolve this issue.`;
    color = "#D35400";
  } else {
    subject = `School account status updated: "${schoolName}"`;
    title = "School Account Status Update";
    content = `Your school account status for <strong>${schoolName}</strong> has been updated to <strong>${status}</strong>.`;
  }

  return sendMailSafe({
    to: email,
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">EduTrack JHS</h1>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:${color};">${title}</h2>
          <p style="color:#444;line-height:1.6;font-size:15px;">
            ${content}
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${process.env.CLIENT_URL || "http://localhost:5173"}/login"
               style="background:${color};color:#fff;padding:14px 32px;
                      border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
              Go to Login Portal
            </a>
          </div>
        </div>
      </div>`
  });
};

// ─── 8. School Welcome Email ──────────────────────────────────
const sendSchoolWelcomeEmail = async (email, schoolName) => {
  return sendMailSafe({
    to: email,
    subject: `Welcome to EduTrack JHS, ${schoolName}!`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">EduTrack JHS</h1>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:#1A3C5E;">Welcome aboard!</h2>
          <p style="color:#444;line-height:1.6;">
            Welcome to EduTrack JHS! <strong>${schoolName}</strong> is now set up and ready to go. Log in to start adding staff, students, and classes.
          </p>
          <p style="color:#888;font-size:13px;margin-top:20px;">
            If you have any questions, our support team is here to help.
          </p>
        </div>
      </div>`,
  });
};

// ─── 9. Guardian Credentials Resent Email ─────────────────────
const sendGuardianCredentialsResentEmail = async (email, name, tempPassword, schoolName) => {
  const loginUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/login`;
  return sendMailSafe({
    to: email,
    subject: `Your Parent Portal Credentials - ${schoolName || "EduTrack JHS"}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">${schoolName || "EduTrack JHS"}</h1>
          <p style="color:#A8C8E8;margin:4px 0 0;">Parent Portal Access</p>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:#1A3C5E;">Hello ${name},</h2>
          <p style="color:#444;line-height:1.6;">
            You requested to resend your parent portal login credentials for <strong>${schoolName || "your school"}</strong>.
          </p>
          <div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 8px;color:#444;">
              <strong>Login Email:</strong> ${email}
            </p>
            <p style="margin:0;color:#444;">
              <strong>Temporary Password:</strong>
              <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:16px;font-weight:bold;">
                ${tempPassword}
              </code>
            </p>
          </div>
          <p style="color:#888;font-size:13px;">
            Please log in and change your password immediately.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${loginUrl}"
               style="background:#2E75B6;color:#fff;padding:14px 32px;
                      border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
              Login to Parent Portal
            </a>
          </div>
          <p style="color:#999;font-size:12px;margin-top:20px;border-top:1px solid #eee;padding-top:16px;">
            If you did not request this, please contact your school administrator immediately.
          </p>
        </div>
      </div>`,
  });
};

// ─── 10. Welcome Student Email ─────────────────────────────────
const sendWelcomeStudentEmail = async (email, name, tempPassword, schoolName) => {
  const loginUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/login`;
  return sendMailSafe({
    to: email,
    subject: `Welcome to ${schoolName || "EduTrack JHS"} Student Portal`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#1A3C5E;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">${schoolName || "EduTrack JHS"}</h1>
          <p style="color:#A8C8E8;margin:4px 0 0;">Student Portal Access</p>
        </div>
        <div style="padding:32px;background:#f9f9f9;">
          <h2 style="color:#1A3C5E;">Welcome, ${name}!</h2>
          <p style="color:#444;line-height:1.6;">
            Your student portal account has been created for <strong>${schoolName || "your school"}</strong>.
          </p>
          <div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:20px;margin:24px 0;">
            <p style="margin:0 0 8px;color:#444;">
              <strong>Login Email:</strong> ${email}
            </p>
            <p style="margin:0;color:#444;">
              <strong>Temporary Password:</strong>
              <code style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:16px;font-weight:bold;">
                ${tempPassword}
              </code>
            </p>
          </div>
          <p style="color:#888;font-size:13px;">
            Please log in and change your password immediately.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${loginUrl}"
               style="background:#2E75B6;color:#fff;padding:14px 32px;
                      border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
              Login to Student Portal
            </a>
          </div>
        </div>
      </div>`,
  });
};

// ─── EXPORT ALL FUNCTIONS ──────────────────────────────────────
module.exports = {
  // Core
  sendMail,
  sendMailSafe,
  
  // Auth Emails
  sendVerificationEmail,
  sendPasswordResetEmail,
  
  // Welcome Emails
  sendWelcomeStaffEmail,
  sendWelcomeGuardianEmail,
  sendWelcomeStudentEmail,
  sendSchoolWelcomeEmail,
  
  // Status & Notification Emails
  sendReportCardEmail,
  sendRegistrationUnderReviewEmail,
  sendSchoolStatusEmail,
  sendGuardianCredentialsResentEmail,
};