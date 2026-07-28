// backend/test-simple.js
require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSimple() {
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: 'asiedureubenwash@gmail.com',
      pass: process.env.BREVO_SMTP_PASSWORD,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: '"Goreb" <asiedureubenwash@gmail.com>',
      to: 'atomosei16@gmail.com',
      subject: 'Simple Test',
      text: 'This is a simple test email.',
    });
    console.log('✅ Sent:', info.messageId);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSimple();