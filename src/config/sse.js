// src/config/sse.js
class SSEConnectionManager {
  constructor() {
    this.clients = new Map(); // schoolId -> Set of response objects
    this.pingIntervals = new Map(); // Track ping intervals per school
  }

  // Add a client connection
  addClient(schoolId, res, req) { // ✅ Added req parameter
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

    // Store client
    if (!this.clients.has(schoolId)) {
      this.clients.set(schoolId, new Set());
    }
    this.clients.get(schoolId).add(res);

    // Set up ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (res.writableEnded) {
        this.removeClient(schoolId, res);
        return;
      }
      res.write(`: ping\n\n`); // Comment line keeps connection alive
    }, 30000); // Every 30 seconds

    this.pingIntervals.set(res, pingInterval);

    // ✅ Fix: Use the passed req for close event
    if (req) {
      req.on('close', () => {
        this.removeClient(schoolId, res);
      });
    }

    console.log(`✅ SSE client connected for school ${schoolId}. Total clients: ${this.getClientCount(schoolId)}`);
  }

  // Remove a client
  removeClient(schoolId, res) {
    if (this.clients.has(schoolId)) {
      this.clients.get(schoolId).delete(res);
      if (this.clients.get(schoolId).size === 0) {
        this.clients.delete(schoolId);
      }
    }

    // Clear ping interval
    if (this.pingIntervals.has(res)) {
      clearInterval(this.pingIntervals.get(res));
      this.pingIntervals.delete(res);
    }

    console.log(`❌ SSE client disconnected for school ${schoolId}. Remaining: ${this.getClientCount(schoolId)}`);
  }

  // Send notification to all clients of a specific school
  sendToSchool(schoolId, notification) {
    if (!this.clients.has(schoolId)) {
      console.log(`ℹ️ No SSE clients for school ${schoolId}`);
      return false;
    }

    const clients = this.clients.get(schoolId);
    let sentCount = 0;

    // Format notification for SSE
    const data = {
      type: 'notification',
      data: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority || 'MEDIUM',
        isRead: notification.isRead || false,
        entityType: notification.entityType || null,
        entityId: notification.entityId || null,
        createdAt: notification.createdAt || new Date().toISOString(),
        ...(notification.metadata && { metadata: notification.metadata }),
      },
      timestamp: new Date().toISOString(),
    };

    const payload = `data: ${JSON.stringify(data)}\n\n`;

    clients.forEach((res) => {
      if (!res.writableEnded) {
        res.write(payload);
        sentCount++;
      }
    });

    console.log(`📨 Sent notification to ${sentCount} SSE clients for school ${schoolId}`);
    return sentCount > 0;
  }

  // Send a test ping to all clients of a school
  pingSchool(schoolId) {
    if (!this.clients.has(schoolId)) return false;
    const clients = this.clients.get(schoolId);
    clients.forEach((res) => {
      if (!res.writableEnded) {
        res.write(`: ping\n\n`);
      }
    });
    return true;
  }

  // Get count of clients for a school
  getClientCount(schoolId) {
    return this.clients.has(schoolId) ? this.clients.get(schoolId).size : 0;
  }

  // Get total clients across all schools
  getTotalClients() {
    let total = 0;
    for (const [schoolId, clients] of this.clients) {
      total += clients.size;
    }
    return total;
  }

  // Clean up all connections (useful for server shutdown)
  cleanup() {
    for (const [schoolId, clients] of this.clients) {
      clients.forEach((res) => {
        if (!res.writableEnded) {
          res.end();
        }
      });
    }
    this.clients.clear();
    this.pingIntervals.clear();
    console.log('🧹 All SSE connections cleaned up');
  }
}

// Singleton instance
const sseManager = new SSEConnectionManager();
module.exports = sseManager;