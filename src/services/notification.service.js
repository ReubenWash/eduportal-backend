const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { sendPush, isConfigured } = require("./push.service");

const getNotifications = async (userId, unreadOnly) => {
  const where = { userId };
  if (unreadOnly === "true") where.isRead = false;
  return prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
};

const markAsRead = async (userId, notificationId) => {
  const n = await prisma.notification.findFirst({ where: { id: notificationId, userId } });
  if (!n) throw createError("Notification not found.", 404);
  return prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
};

const markAllRead = async (userId) => {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  return { message: "All marked as read." };
};

const deleteNotification = async (userId, notificationId) => {
  const n = await prisma.notification.findFirst({ where: { id: notificationId, userId } });
  if (!n) throw createError("Notification not found.", 404);
  await prisma.notification.delete({ where: { id: notificationId } });
};

const broadcast = async (schoolId, { title, message, type, audience }) => {
  // Find target users by audience
  const roleMap = {
    ALL:      undefined,
    TEACHERS: { in: ["CLASS_TEACHER", "SUBJECT_TEACHER"] },
    PARENTS:  { equals: "PARENT" },
    STUDENTS: { equals: "STUDENT" },
  };

  const roleFilter = roleMap[audience];
  const users = await prisma.user.findMany({
    where: {
      schoolId,
      isActive: true,
      ...(roleFilter && { role: roleFilter }),
    },
    select: { id: true },
  });

  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId:  u.id,
      title,
      message,
      type:    type || "info",
      isRead:  false,
    })),
  });

  await prisma.announcement.create({
    data: { schoolId, title, body: message, audience: audience || "ALL" },
  });

  return { sent: users.length };
};

const massBroadcast = async ({ title, message, type, audience }) => {
  const roleMap = {
    ALL:      undefined,
    TEACHERS: { in: ["CLASS_TEACHER", "SUBJECT_TEACHER"] },
    PARENTS:  { equals: "PARENT" },
    STUDENTS: { equals: "STUDENT" },
    SCHOOLS:  { equals: "SCHOOL_ADMIN" },
  };

  const roleFilter = roleMap[audience];
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      ...(roleFilter && { role: roleFilter }),
    },
    select: { id: true },
  });

  // Batch insert notifications
  const batchSize = 1000;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await prisma.notification.createMany({
      data: batch.map((u) => ({
        userId:  u.id,
        title,
        message,
        type:    type || "info",
        isRead:  false,
      })),
    });
  }

  // Also create an Announcement if needed
  await prisma.announcement.create({
    data: {
      schoolId: null,
      title,
      body: message,
      audience,
    }
  });

  return { sent: users.length };
};

const createNotification = async (userId, { title, message, type }) => {
  return prisma.notification.create({
    data: { userId, title, message, type: type || "info" },
  });
};

// NOTE: there is no push notification provider (FCM/OneSignal/APNs) wired up
// in this codebase yet — no device-token storage, no push SDK, no credentials.
// This creates the in-app notification records via the existing broadcast
// path so the request doesn't 404, but it does NOT deliver an actual mobile
// push. Wire up a real provider before relying on this for push delivery.
const registerDeviceToken = async (userId, token, platform) => {
  if (!token) throw createError("Device token is required.", 400);
  return prisma.deviceToken.upsert({
    where: { token },
    update: { userId, platform: platform || "web" },
    create: { userId, token, platform: platform || "web" },
  });
};

const removeDeviceToken = async (userId, token) => {
  await prisma.deviceToken.deleteMany({ where: { userId, token } });
  return { message: "Device token removed." };
};

const pushNotification = async ({ title, body, audience }) => {
  // Always create the in-app notifications so the request has a
  // guaranteed, visible effect regardless of push provider status.
  const inAppResult = await massBroadcast({ title, message: body, type: "push", audience });

  const roleMap = {
    ALL:      undefined,
    TEACHERS: { in: ["CLASS_TEACHER", "SUBJECT_TEACHER"] },
    PARENTS:  { equals: "PARENT" },
    STUDENTS: { equals: "STUDENT" },
    SCHOOLS:  { equals: "SCHOOL_ADMIN" },
  };
  const roleFilter = roleMap[audience];

  const deviceTokens = await prisma.deviceToken.findMany({
    where: { user: { isActive: true, ...(roleFilter && { role: roleFilter }) } },
    select: { token: true },
  });

  const pushResult = await sendPush(deviceTokens.map((d) => d.token), { title, body });

  // Clean up tokens Firebase reports as dead/unregistered.
  if (pushResult.invalidTokens?.length) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: pushResult.invalidTokens } } });
  }

  return {
    ...inAppResult,
    push: pushResult.delivered
      ? { delivered: true, successCount: pushResult.successCount, failureCount: pushResult.failureCount }
      : { delivered: false, reason: pushResult.reason, note: isConfigured()
            ? "Push provider is configured but delivery failed — check server logs."
            : "No push provider configured (FIREBASE_SERVICE_ACCOUNT_JSON not set) — delivered as in-app notification only." },
  };
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/broadcasts — history of announcements
// ─────────────────────────────────────────────────────
const getBroadcastHistory = async (query) => {
  const { page = 1, limit = 20, audience, schoolId } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (audience) where.audience = audience;
  if (schoolId) where.schoolId = schoolId;

  const [announcements, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { school: { select: { id: true, name: true } } },
    }),
    prisma.announcement.count({ where }),
  ]);

  return {
    data: announcements,
    pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
  };
};

module.exports = { getNotifications, markAsRead, markAllRead, deleteNotification, broadcast, massBroadcast, createNotification, pushNotification, getBroadcastHistory, registerDeviceToken, removeDeviceToken };
