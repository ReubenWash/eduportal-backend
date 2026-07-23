const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const sseManager = require('../config/sse');

// SSE endpoint for real-time notifications
router.get('/notifications', authenticate, (req, res) => {
  const schoolId = req.user.schoolId;

  if (!schoolId) {
    return res.status(400).json({ error: 'School ID required' });
  }

  // ✅ Pass req as third argument
  sseManager.addClient(schoolId, res, req);

  // Also send any unread notifications as initial state
  // Optional: fetch recent unread notifications and send them
  // This would require importing prisma
});

// Health check endpoint to verify SSE is working
router.get('/status', authenticate, (req, res) => {
  const schoolId = req.user.schoolId;
  const clientCount = sseManager.getClientCount(schoolId);

  res.json({
    status: 'ok',
    schoolId,
    activeConnections: clientCount,
    totalConnections: sseManager.getTotalClients(),
    timestamp: new Date().toISOString(),
  });
});

// Admin endpoint to test sending a notification (for testing only)
router.post('/test', authenticate, async (req, res) => {
  const schoolId = req.user.schoolId;

  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not allowed in production' });
  }

  const testNotification = {
    id: `test_${Date.now()}`,
    title: 'Test Notification',
    message: 'This is a test notification from SSE',
    type: 'INFO',
    priority: 'MEDIUM',
    isRead: false,
    entityType: null,
    entityId: null,
    createdAt: new Date(),
    metadata: { test: true },
  };

  const sent = sseManager.sendToSchool(schoolId, testNotification);

  res.json({
    success: sent,
    message: sent ? 'Test notification sent' : 'No clients connected',
    clientsConnected: sseManager.getClientCount(schoolId),
  });
});

module.exports = router;