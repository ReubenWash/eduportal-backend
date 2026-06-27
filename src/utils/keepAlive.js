const https  = require("https");
const http   = require("http");
const logger = require("../config/logger");

/**
 * Ping the API health endpoint every 13 minutes to prevent
 * Koyeb free-tier cold starts (idle timeout is ~15 minutes)
 */
const startKeepAlive = () => {
  const url      = process.env.KEEP_ALIVE_URL;
  const interval = 13 * 60 * 1000; // 13 minutes

  const ping = () => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, (res) => {
        logger.info(`Keep-alive ping → ${res.statusCode}`);
      })
      .on("error", (err) => {
        logger.warn("Keep-alive ping failed:", err.message);
      });
  };

  // First ping after 1 minute, then every 13 minutes
  setTimeout(() => {
    ping();
    setInterval(ping, interval);
  }, 60 * 1000);

  logger.info("⏰ Keep-alive scheduler started");
};

module.exports = { startKeepAlive };
