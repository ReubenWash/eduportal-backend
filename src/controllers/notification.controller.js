const notificationService = require("../services/notification.service");
const { sendSuccess } = require("../utils/apiResponse");
const { emitToSchool, emitToUser, emitToAll } = require("../config/socket");

const list = async (req, res) => {
  const r = await notificationService.getNotifications(req.user.userId, req.query.unread);
  return sendSuccess(res, 200, "Notifications fetched.", r);
};

const markRead = async (req, res) => {
  const r = await notificationService.markAsRead(req.user.userId, req.params.id);
  // Emit updated unread count to the user
  const unreadCount = await notificationService.getUnreadCount(req.user.userId);
  emitToUser(req.user.userId, 'unread-count', { count: unreadCount });
  return sendSuccess(res, 200, "Marked as read.", r);
};

const readAll = async (req, res) => {
  await notificationService.markAllRead(req.user.userId);
  emitToUser(req.user.userId, 'unread-count', { count: 0 });
  return sendSuccess(res, 200, "All marked as read.");
};

const remove = async (req, res) => {
  await notificationService.deleteNotification(req.user.userId, req.params.id);
  // Emit updated unread count
  const unreadCount = await notificationService.getUnreadCount(req.user.userId);
  emitToUser(req.user.userId, 'unread-count', { count: unreadCount });
  return sendSuccess(res, 200, "Notification deleted.");
};

const broadcast = async (req, res) => {
  const r = await notificationService.broadcast(req.user.schoolId, req.body);
  
  // Emit to school room
  if (r.sent > 0) {
    const notification = {
      id: r.notificationId || Date.now(),
      title: req.body.title,
      message: req.body.message,
      type: req.body.type || 'info',
      createdAt: new Date().toISOString()
    };
    emitToSchool(req.user.schoolId, 'new-notification', notification);
  }
  
  return sendSuccess(res, 200, "Broadcast sent.", r);
};

const massBroadcast = async (req, res) => {
  const r = await notificationService.massBroadcast(req.body);
  
  // Emit to all connected clients
  if (r.sent > 0) {
    const notification = {
      id: r.notificationId || Date.now(),
      title: req.body.title,
      message: req.body.message,
      type: req.body.type || 'info',
      createdAt: new Date().toISOString()
    };
    emitToAll('new-notification', notification);
  }
  
  return sendSuccess(res, 200, "Mass broadcast sent.", r);
};

const push = async (req, res) => {
  const r = await notificationService.pushNotification(req.body);
  return sendSuccess(res, 200, "Push request processed (delivered in-app; no push provider configured).", r);
};

const broadcastHistory = async (req, res) => {
  const r = await notificationService.getBroadcastHistory(req.query);
  return sendSuccess(res, 200, "Broadcast history fetched.", r);
};

const registerDeviceToken = async (req, res) => {
  const r = await notificationService.registerDeviceToken(req.user.userId, req.body.token, req.body.platform);
  return sendSuccess(res, 200, "Device token registered.", r);
};

const removeDeviceToken = async (req, res) => {
  const r = await notificationService.removeDeviceToken(req.user.userId, req.body.token);
  return sendSuccess(res, 200, r.message);
};

module.exports = { 
  list, 
  markRead, 
  readAll, 
  remove, 
  broadcast, 
  massBroadcast, 
  push, 
  broadcastHistory, 
  registerDeviceToken, 
  removeDeviceToken 
};