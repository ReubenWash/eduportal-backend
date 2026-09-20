const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { sendPush, isConfigured } = require("./push.service");
const { sendAnnouncementEmail } = require("./email.service");

const normalizeAudience = (audience) => {
  if (!audience) return "ALL";
  const normalized = String(audience).trim();
  const map = {
    ALL_SCHOOLS: "ALL_SCHOOLS",
    PREMIUM_ONLY: "PREMIUM_ONLY",
    BASIC_ONLY: "BASIC_ONLY",
    ALL_TEACHERS: "TEACHERS",
    ALL_PARENTS: "PARENTS",
    ALL_STUDENTS: "STUDENTS",
    ALL_SCHOOL_ADMINS: "SCHOOLS",
    SCHOOLS: "SCHOOLS",
    TEACHERS: "TEACHERS",
    PARENTS: "PARENTS",
    STUDENTS: "STUDENTS",
    ALL: "ALL",
    SELECTED_SCHOOLS: "SELECTED_SCHOOLS",
  };
  return map[normalized] || normalized;
};

const buildSchoolAudienceFilter = async (audience, selectedSchoolIds = []) => {
  const normalizedAudience = normalizeAudience(audience);

  if (normalizedAudience === "SELECTED_SCHOOLS") {
    const ids = Array.isArray(selectedSchoolIds) ? selectedSchoolIds.filter(Boolean) : [];
    return { id: { in: ids.length ? ids : ["__none__"] } };
  }

  if (normalizedAudience === "ALL_SCHOOLS") {
    return { status: "ACTIVE" };
  }

  if (normalizedAudience === "PREMIUM_ONLY") {
    return { status: "ACTIVE", plan: "PREMIUM" };
  }

  if (normalizedAudience === "BASIC_ONLY") {
    return { status: "ACTIVE", plan: "BASIC" };
  }

  return {};
};

const sendSchoolAnnouncementEmails = async ({ title, message, audience, selectedSchools = [], schoolIds = [] }) => {
  const schoolIdList = Array.isArray(selectedSchools) && selectedSchools.length
    ? selectedSchools
    : Array.isArray(schoolIds) ? schoolIds : [];

  if (!schoolIdList.length && normalizeAudience(audience) !== "ALL_SCHOOLS") return { sent: 0, failed: 0 };

  const where = normalizeAudience(audience) === "ALL_SCHOOLS"
    ? { status: "ACTIVE" }
    : { id: { in: schoolIdList } };

  const schools = await prisma.school.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      users: {
        where: { role: "SCHOOL_ADMIN", isActive: true },
        select: { email: true },
      },
    },
  });

  const recipientSet = new Set();
  for (const school of schools) {
    if (school.email) recipientSet.add(school.email);
    for (const user of school.users || []) {
      if (user.email) recipientSet.add(user.email);
    }
  }

  const recipients = [...recipientSet];
  const results = await Promise.all(recipients.map(async (to) => {
    try {
      await sendAnnouncementEmail(to, title, message, "EduTrack JHS");
      return { to, success: true };
    } catch (err) {
      return { to, success: false, error: err.message };
    }
  }));

  const sent = results.filter(r => r.success).length;
  return { sent, failed: results.length - sent, recipients: results };
};

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

// ── Get unread count for a user ────────────────────────────────
const getUnreadCount = async (userId) => {
  return prisma.notification.count({
    where: { userId, isRead: false }
  });
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

  if (users.length === 0) {
    return { sent: 0, notificationId: null };
  }

  // Create notifications
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

  // Get the first notification ID for reference
  const firstNotification = await prisma.notification.findFirst({
    where: { 
      title, 
      message, 
      type: type || "info" 
    },
    orderBy: { createdAt: 'desc' }
  });

  return { sent: users.length, notificationId: firstNotification?.id };
};

const massBroadcast = async ({ title, message, type, audience, channels, selectedSchools, schoolIds }) => {
  const normalizedAudience = normalizeAudience(audience);
  const enabledChannels = channels || {};
  const selectedSchoolIds = Array.isArray(selectedSchools) ? selectedSchools : Array.isArray(schoolIds) ? schoolIds : [];

  const roleMap = {
    ALL:      undefined,
    TEACHERS: { in: ["CLASS_TEACHER", "SUBJECT_TEACHER"] },
    PARENTS:  { equals: "PARENT" },
    STUDENTS: { equals: "STUDENT" },
    SCHOOLS:  { equals: "SCHOOL_ADMIN" },
  };

  let schoolFilter = {};
  let where = { isActive: true };

  if (normalizedAudience === "SELECTED_SCHOOLS") {
    schoolFilter = { id: { in: selectedSchoolIds.length ? selectedSchoolIds : ["__none__"] } };
    where = { isActive: true, schoolId: { in: selectedSchoolIds.length ? selectedSchoolIds : ["__none__"] } };
  } else if (normalizedAudience === "ALL_SCHOOLS") {
    schoolFilter = { status: "ACTIVE" };
    where = { isActive: true, school: { status: "ACTIVE" } };
  } else if (normalizedAudience === "PREMIUM_ONLY") {
    schoolFilter = { status: "ACTIVE", plan: "PREMIUM" };
    where = { isActive: true, school: { status: "ACTIVE", plan: "PREMIUM" } };
  } else if (normalizedAudience === "BASIC_ONLY") {
    schoolFilter = { status: "ACTIVE", plan: "BASIC" };
    where = { isActive: true, school: { status: "ACTIVE", plan: "BASIC" } };
  } else if (normalizedAudience === "SCHOOLS") {
    where = { isActive: true, role: { equals: "SCHOOL_ADMIN" } };
  } else {
    const roleFilter = roleMap[normalizedAudience];
    if (roleFilter) where.role = roleFilter;
  }

  const users = await prisma.user.findMany({
    where,
    select: { id: true, schoolId: true, email: true },
  });

  if (users.length === 0 && !enabledChannels.email) {
    return { sent: 0, notificationId: null, email: { sent: 0, failed: 0 } };
  }

  if (users.length > 0) {
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
  }

  await prisma.announcement.create({
    data: {
      schoolId: normalizedAudience === "SELECTED_SCHOOLS" && selectedSchoolIds.length === 1 ? selectedSchoolIds[0] : null,
      title,
      body: message,
      audience: normalizedAudience,
    }
  });

  const emailResult = enabledChannels.email || enabledChannels.smtp
    ? await sendSchoolAnnouncementEmails({ title, message, audience: normalizedAudience, selectedSchools: selectedSchoolIds, schoolIds: selectedSchoolIds })
    : { sent: 0, failed: 0 };

  const firstNotification = await prisma.notification.findFirst({
    where: { title, message, type: type || "info" },
    orderBy: { createdAt: 'desc' }
  });

  return { sent: users.length, notificationId: firstNotification?.id, email: emailResult };
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

module.exports = { 
  getNotifications, 
  markAsRead, 
  markAllRead, 
  deleteNotification, 
  broadcast, 
  massBroadcast, 
  createNotification, 
  pushNotification, 
  getBroadcastHistory, 
  registerDeviceToken, 
  removeDeviceToken,
  getUnreadCount // ← ADDED
};