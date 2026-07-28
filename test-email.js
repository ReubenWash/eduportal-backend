// backend/test-email.js
require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  console.log('📧 Testing email configuration...');
  console.log('========================================');
  console.log('SMTP Host:', process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST || 'Not set');
  console.log('SMTP Port:', process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT || 'Not set');
  console.log('SMTP User:', process.env.BREVO_SMTP_USER || process.env.SMTP_USER || 'Not set');
  console.log('SMTP Password:', process.env.BREVO_SMTP_PASSWORD || process.env.SMTP_PASS ? '✅ Set' : '❌ Not set');
  console.log('Sender Email:', process.env.BREVO_SENDER_EMAIL || process.env.SENDER_EMAIL || 'Not set');
  console.log('Sender Name:', process.env.BREVO_SENDER_NAME || process.env.SENDER_NAME || 'Not set');
  console.log('========================================');

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER || process.env.SMTP_USER,
      pass: process.env.BREVO_SMTP_PASSWORD || process.env.SMTP_PASS,
    },
  });

  try {
    // Step 1: Verify connection
    console.log('🔍 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!');

    // Step 2: Send test email
    console.log('📧 Sending test email...');
    const fromEmail = process.env.BREVO_SENDER_EMAIL || process.env.SENDER_EMAIL || process.env.BREVO_SMTP_USER;
    const fromName = process.env.BREVO_SENDER_NAME || process.env.SENDER_NAME || 'EduTrack JHS';

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: 'shaddyblaykes@gmail.com',
      subject: 'Test Email from EduTrack',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
          <div style="background: #4F46E5; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0;">EduTrack JHS</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #1A3C5E;">Test Email</h2>
            <p style="color: #444; line-height: 1.6;">This is a test email from EduTrack JHS to verify your SMTP configuration.</p>
            <p style="color: #444; line-height: 1.6;">Sender: <strong>${fromEmail}</strong></p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #888; font-size: 12px; text-align: center;">
              Sent from EduTrack JHS - ${new Date().toLocaleString()}
            </p>
          </div>
        </div>
      `
    });

    console.log('✅ Test email sent successfully!');
    console.log('📧 Message ID:', info.messageId);
    console.log('📧 Check your inbox/spam folder at: atomosei16@gmail.com');
    console.log('📧 From:', `"${fromName}" <${fromEmail}>`);

  } catch (error) {
    console.error('❌ Test email failed:', error.message);
    if (error.code === 'EAUTH') {
      console.error('   ─────────────────────────────────────────────');
      console.error('   💡 Authentication failed. Check your SMTP credentials:');
      console.error('   • SMTP Username:', process.env.BREVO_SMTP_USER || process.env.SMTP_USER);
      console.error('   • SMTP Password: Make sure you\'re using the SMTP key (not your account password)');
      console.error('   ─────────────────────────────────────────────');
    } else if (error.code === 'ECONNECTION') {
      console.error('   ─────────────────────────────────────────────');
      console.error('   💡 Connection failed. Check:');
      console.error('   • Host:', process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST);
      console.error('   • Port:', process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT);
      console.error('   ─────────────────────────────────────────────');
    } else if (error.code === 'ESOCKET') {
      console.error('   ─────────────────────────────────────────────');
      console.error('   💡 Socket error. Check your network connection.');
      console.error('   ─────────────────────────────────────────────');
    }
    console.error('   Full error details:', error);
  }
}

testEmail();