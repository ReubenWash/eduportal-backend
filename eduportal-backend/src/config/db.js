const { PrismaClient } = require("@prisma/client");
const logger = require("./logger");

let applyMiddleware = null;
try {
  ({ applyMiddleware } = require("../../prisma/middleware"));
} catch (error) {
  logger.warn("Prisma middleware unavailable, continuing without SSE middleware:", error.message);
}

// Prevent multiple Prisma instances in development (hot reload)
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { level: "warn",  emit: "event" },
      { level: "error", emit: "event" },
      // Uncomment to log all queries in development:
      // { level: "query", emit: "event" },
    ],
  });

// Apply SSE middleware to auto-push notifications to clients when available
if (typeof applyMiddleware === "function") {
  applyMiddleware(prisma);
}

// Log Prisma warnings and errors through Winston
prisma.$on("warn",  (e) => logger.warn("Prisma: "  + e.message));
prisma.$on("error", (e) => logger.error("Prisma: " + e.message));

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// ── Test connection on startup ─────────────────────────────────
async function connectDB() {
  try {
    await prisma.$connect();
    logger.info("✅ Database connected successfully");
  } catch (error) {
    logger.error("❌ Database connection failed:", error.message);
    throw error;
  }
}

module.exports = { prisma, connectDB };