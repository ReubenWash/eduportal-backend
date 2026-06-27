const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");

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

  return { sent: users.length };
};

const createNotification = async (userId, { title, message, type }) => {
  return prisma.notification.create({
    data: { userId, title, message, type: type || "info" },
  });
};

module.exports = { getNotifications, markAsRead, markAllRead, deleteNotification, broadcast, createNotification };
