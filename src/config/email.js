const nodemailer = require("nodemailer");
const logger = require("./logger");

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,
  port: 587,
  secure: false,        // ← MUST be false for 587 (it uses STARTTLS)
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASSWORD,
  },
  // 👇 Default sender applied to every email that doesn't specify one
  from: `"${process.env.BREVO_SENDER_NAME || 'EduTrack'}" <${process.env.BREVO_SENDER_EMAIL}>`,
});

transporter.verify((error) => {
  if (error) {
    logger.warn("Email transporter not ready:", error.message);
  } else {
    logger.info("✅ Email transporter ready");
  }
});

module.exports = transporter;