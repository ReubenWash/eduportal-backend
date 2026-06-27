require("express-async-errors");
const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const morgan       = require("morgan");
const cookieParser = require("cookie-parser");
const routes       = require("./routes");
const errorHandler = require("./middleware/errorHandler");
const logger       = require("./config/logger");

const app = express();

// ── Security headers ───────────────────────────────────────────
app.use(helmet());

// ── CORS ───────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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
    success:     true,
    message:     "EduTrack API is running",
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── API routes ─────────────────────────────────────────────────
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
