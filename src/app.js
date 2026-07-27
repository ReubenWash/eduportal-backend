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
// Comprehensive list of allowed origins
const allowedOrigins = [
  // Local development
  "http://localhost:5173",      // Vite
  "http://localhost:3000",      // React default
  "http://localhost:5000",      // Backend itself
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  
  // Production - Add your frontend Render URL here
  "https://your-frontend-url.onrender.com", // REPLACE THIS WITH YOUR ACTUAL FRONTEND URL
  
  // Add any other frontend URLs
  process.env.CLIENT_URL,       // From environment variable
].filter(Boolean); // Remove any undefined values

// Log the allowed origins in development
if (process.env.NODE_ENV !== 'production') {
  console.log('CORS allowed origins:', allowedOrigins);
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, or same-origin requests)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if the origin is allowed
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // In development, log blocked origins
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`CORS blocked: ${origin}`);
      }
      
      // For production, you might want to be more strict
      // For now, we'll allow it if it's a localhost or render URL
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      const isRender = /^https:\/\/.*\.onrender\.com$/.test(origin);
      
      if (isLocalhost || isRender) {
        return callback(null, true);
      }
      
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Headers",
      "Access-Control-Allow-Methods"
    ],
    exposedHeaders: ["Authorization"], // Expose headers to frontend
    optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
    preflightContinue: false,
  })
);

// Handle preflight requests explicitly
app.options('*', cors()); // Enable preflight for all routes

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