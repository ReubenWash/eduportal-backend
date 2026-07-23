// test-email.js
require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,
  port: parseInt(process.env.BREVO_SMTP_PORT),
  secure: false, // TLS for port 587
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASSWORD,
  },
});

async function testEmail() {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.BREVO_SENDER_NAME}" <${process.env.BREVO_SENDER_EMAIL}>`,
      to: "your-test-email@gmail.com", // 🔁 CHANGE THIS to your real email
      subject: "✅ Brevo SMTP Test from EduPortal",
      html: "<h1>It works!</h1><p>Your Brevo SMTP configuration is correct.</p>",
    });
    console.log("✅ Email sent! Message ID:", info.messageId);
  } catch (error) {
    console.error("❌ Failed to send email:", error.message);
  }
}

testEmail();