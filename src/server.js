require("dotenv").config();
const http = require("http");
const app = require("./app");
const logger = require("./config/logger");
const { connectDB } = require("./config/db");
const { startKeepAlive } = require("./utils/keepAlive");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

async function startServer() {
  try {
    // 1. Connect to database
    await connectDB();

    // 2. Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🚀 EduTrack API running on port ${PORT}`);
      logger.info(`📦 Environment: ${process.env.NODE_ENV}`);
    });

    // 3. Start keep-alive ping (prevents Koyeb cold starts)
    if (process.env.NODE_ENV === "production" && process.env.KEEP_ALIVE_URL) {
      startKeepAlive();
    }
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// ── Graceful shutdown ──────────────────────────────────────────
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // Force shutdown after 10s if hanging
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ── Unhandled errors ───────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

startServer();
