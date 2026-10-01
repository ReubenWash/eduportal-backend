require("express-async-errors");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const routes = require("./routes");
const sseRoutes = require("./routes/sse.routes");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./config/logger");

const app = express();

// ── Security headers ───────────────────────────────────────────
app.use(helmet());

// ── CORS ───────────────────────────────────────────────────────
const allowedOrigins = [
  // Local development
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",

  // Production frontend(s)
  "https://eduportal-frontend-1kwq.vercel.app",
  "https://eduportal-frontend.vercel.app",

  // From environment
  process.env.CLIENT_URL,
].filter(Boolean);

if (process.env.NODE_ENV !== 'production') {
  console.log('CORS allowed origins:', allowedOrigins);
}

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin (Postman, mobile apps, server-to-server)
      if (!origin) return callback(null, true);

      // Exact match in allow-list
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Localhost / 127.0.0.1 any port
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Any Render subdomain
      if (/^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin)) {
        return callback(null, true);
      }

      // Any Vercel subdomain (covers preview deployments)
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      console.warn(`🚫 CORS blocked: ${origin}`);
      // Do NOT throw — just refuse to set the header, request is rejected cleanly
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Authorization"],
    optionsSuccessStatus: 200,
    preflightContinue: false,
  })
);

// Handle preflight requests explicitly
app.options("*", cors());

// ── Body parsers ───────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Cookie parser (required for refresh token cookie) ─────────
app.use(cookieParser());

// ── HTTP request logging ───────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.http(msg.trim()) },
    })
  );
}

// ── Health check ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "EduTrack API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── SSE real‑time notifications ──────────────────────────────
app.use("/api/sse", sseRoutes);

// ── API v1 routes (public, tenant, and admin) ────────────────
// All routes including admin are now mounted in routes/index.js
app.use("/api/v1", routes);

// ── 404 handler ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ── Global error handler ───────────────────────────────────────
app.use(errorHandler);

module.exports = app;