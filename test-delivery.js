// backend/test-delivery.js
require('dotenv').config();
const nodemailer = require('nodemailer');

async function checkDelivery() {
  const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: parseInt(process.env.BREVO_SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_PASSWORD,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Test" <${process.env.BREVO_SENDER_EMAIL || 'noreply@yourdomain.com'}>`,
      to: 'your_actual_email@example.com', // ← Your email
      subject: 'Delivery Test',
      text: 'This is a delivery test from Brevo SMTP.',
    });
    console.log('✅ Email sent:', info.messageId);
    console.log('📧 Check your inbox/spam folder');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDelivery();