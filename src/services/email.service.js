const transporter = require("../config/email");
const logger      = require("../config/logger");

const FROM = `EduTrack JHS <${process.env.EMAIL_FROM || "noreply@edutrack.com"}>`;

// ── Generic send helper ────────────────────────────────────────
const sendMail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    logger.info(`Email sent to ${to} — ${subject} [${info.messageId}]`);
    return info;
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error.message);
    throw error;
  }
};

// ── Email templates ────────────────────────────────────────────

const sendVerificationEmail = async (email, name, token) => {
  const url = `${process.env.CLIENT_URL}/verify-email/${token}`;
  await sendMail({
    to:      email,
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
            Please verify your email address to activate your account.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${url}"
               style="background:#2E75B6;color:#fff;padding:14px 32px;
                      border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
              Verify Email Address
            </a>
          </div>
          <p style="color:#888;font-size:13px;">
            This link expires in <strong>24 hours</strong>.<br/>
            If you did not register, please ignore this email.
          </p>
        </div>
      </div>`,
  });
};

const sendPasswordResetEmail = async (email, name, token) => {
  const url = `${process.env.CLIENT_URL}/reset-password/${token}`;
  await sendMail({
    to:      email,
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

const sendWelcomeStaffEmail = async (email, name, tempPassword, schoolName) => {
  const loginUrl = `${process.env.CLIENT_URL}/login`;
  await sendMail({
    to:      email,
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

const sendReportCardEmail = async (email, parentName, studentName, term, pdfUrl, schoolName) => {
  await sendMail({
    to:      email,
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

const sendRegistrationUnderReviewEmail = async (email, name, schoolName) => {
  await sendMail({
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
            Please make sure to verify your email using the link sent in the previous verification email.
          </p>
        </div>
      </div>`,
  });
};

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

  await sendMail({
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

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeStaffEmail,
  sendReportCardEmail,
  sendRegistrationUnderReviewEmail,
  sendSchoolStatusEmail,
};
