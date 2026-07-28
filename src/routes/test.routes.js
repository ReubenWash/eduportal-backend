// backend/routes/test.routes.js
const express = require('express');
const router = express.Router();
const { sendMail } = require('../services/email.service');

// Test email endpoint
router.post('/test-email', async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    console.log('📧 Sending test email to:', to);
    console.log('SMTP Host:', process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST);
    console.log('SMTP User:', process.env.BREVO_SMTP_USER || process.env.SMTP_USER);
    console.log('SMTP Password set:', !!(process.env.BREVO_SMTP_PASSWORD || process.env.SMTP_PASS));

    const result = await sendMail({
      to: to,
      subject: subject || 'Test Email from EduTrack',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
          <div style="background: #4F46E5; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0;">EduTrack JHS</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #1A3C5E;">Test Email</h2>
            <p style="color: #444; line-height: 1.6;">${message || 'This is a test email from EduTrack JHS to verify that your SMTP configuration is working correctly.'}</p>
            <p style="color: #444; line-height: 1.6;">If you received this email, your email configuration is working properly!</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #888; font-size: 12px; text-align: center;">
              Sent from EduTrack JHS - ${new Date().toLocaleString()}
            </p>
          </div>
        </div>
      `
    });

    res.status(200).json({
      success: true,
      message: 'Test email sent successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;