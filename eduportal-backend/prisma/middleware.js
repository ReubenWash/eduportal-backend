// src/prisma/middleware.js
const { Prisma } = require('@prisma/client');
const { prisma } = require('../config/db'); // ✅ Import prisma instance
const sseManager = require('../config/sse');

/**
 * Prisma middleware that automatically pushes notifications to SSE clients
 * whenever a Notification is created, updated, or deleted.
 */
const notificationMiddleware = async (params, next) => {
  const result = await next(params);

  // Handle notification creation
  if (params.model === 'Notification' && params.action === 'create') {
    const notification = result;

    // ✅ Fetch the user to get schoolId
    try {
      const user = await prisma.user.findUnique({
        where: { id: notification.userId },
        select: { schoolId: true },
      });
      const schoolId = user?.schoolId;

      if (schoolId) {
        // Push to SSE clients
        const sent = sseManager.sendToSchool(schoolId, notification);
        console.log(`📨 SSE push for notification ${notification.id} to school ${schoolId}: ${sent ? 'sent' : 'no clients'}`);
      } else {
        console.warn(`⚠️ Notification ${notification.id} created without schoolId, SSE not pushed`);
      }
    } catch (error) {
      console.error('Error fetching user for SSE push:', error);
    }
  }

  // Optional: Handle notification updates (e.g., marking as read)
  if (params.model === 'Notification' && params.action === 'update') {
    const notification = result;

    // Notify clients about the update (e.g., unread count changed)
    // This is optional and can be implemented if needed
  }

  return result;
};

/**
 * Apply middleware to Prisma client
 * Call this after creating your prisma instance
 */
const applyMiddleware = (prisma) => {
  prisma.$use(notificationMiddleware);
  console.log('✅ Prisma middleware applied for SSE notifications');
};

module.exports = {
  notificationMiddleware,
  applyMiddleware,
};