const notificationService = require("../services/notification.service");
const { sendSuccess }     = require("../utils/apiResponse");

const list      = async (req, res) => { const r = await notificationService.getNotifications(req.user.userId, req.query.unread); return sendSuccess(res, 200, "Notifications fetched.", r); };
const markRead  = async (req, res) => { const r = await notificationService.markAsRead(req.user.userId, req.params.id); return sendSuccess(res, 200, "Marked as read.", r); };
const readAll   = async (req, res) => { await notificationService.markAllRead(req.user.userId); return sendSuccess(res, 200, "All marked as read."); };
const remove    = async (req, res) => { await notificationService.deleteNotification(req.user.userId, req.params.id); return sendSuccess(res, 200, "Notification deleted."); };
const broadcast = async (req, res) => { const r = await notificationService.broadcast(req.user.schoolId, req.body); return sendSuccess(res, 200, "Broadcast sent.", r); };

module.exports = { list, markRead, readAll, remove, broadcast };
