// backend/config/socket.js
const { Server } = require('socket.io');
const http = require('http');

let io = null;

const initializeSocket = (server) => {
  // Create Socket.IO server with CORS config
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.userId = decoded.userId;
      socket.schoolId = decoded.schoolId;
      socket.role = decoded.role;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 User ${socket.userId} connected: ${socket.id}`);

    // Join user to their school room
    if (socket.schoolId) {
      socket.join(`school_${socket.schoolId}`);
      console.log(`📢 User joined room: school_${socket.schoolId}`);
    }

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);
    console.log(`📢 User joined room: user_${socket.userId}`);

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`🔌 User ${socket.userId} disconnected: ${socket.id}`);
    });

    // Handle marking notification as read
    socket.on('mark-read', async (notificationId) => {
      try {
        const { prisma } = require('./db');
        await prisma.notification.update({
          where: { id: notificationId },
          data: { isRead: true }
        });
        // Emit updated unread count
        const unreadCount = await prisma.notification.count({
          where: { userId: socket.userId, isRead: false }
        });
        io.to(`user_${socket.userId}`).emit('unread-count', { count: unreadCount });
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    });

    // Handle marking all as read
    socket.on('mark-all-read', async () => {
      try {
        const { prisma } = require('./db');
        await prisma.notification.updateMany({
          where: { userId: socket.userId, isRead: false },
          data: { isRead: true }
        });
        io.to(`user_${socket.userId}`).emit('unread-count', { count: 0 });
      } catch (error) {
        console.error('Error marking all as read:', error);
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

const emitToSchool = (schoolId, event, data) => {
  if (io) {
    io.to(`school_${schoolId}`).emit(event, data);
    console.log(`📤 Emitted ${event} to school ${schoolId}`);
  }
};

const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
    console.log(`📤 Emitted ${event} to user ${userId}`);
  }
};

const emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
    console.log(`📤 Emitted ${event} to all connected clients`);
  }
};

module.exports = {
  initializeSocket,
  getIO,
  emitToSchool,
  emitToUser,
  emitToAll
};