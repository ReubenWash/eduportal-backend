const axios = require("axios");
const logger = require("../config/logger");

const normalizePhone = (phone) => {
  if (typeof phone !== "string") return null;
  const normalized = phone.trim().replace(/[\s().-]/g, "");
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  return /^\d{7,15}$/.test(digits) ? digits : null;
};

const sendSms = async (recipients, message) => {
  const uniqueRecipients = [...new Set((recipients || []).map(normalizePhone).filter(Boolean))];
  const skipped = (recipients || []).length - uniqueRecipients.length;
  if (!uniqueRecipients.length) {
    return {
      configured: Boolean(process.env.ARKESEL_API_KEY && process.env.ARKESEL_SENDER_ID),
      attempted: 0,
      accepted: 0,
      failed: 0,
      skipped,
      noRecipients: true,
    };
  }

  const apiKey = process.env.ARKESEL_API_KEY;
  const sender = process.env.ARKESEL_SENDER_ID;
  if (!apiKey || !sender) {
    logger.warn("SMS delivery skipped: ARKESEL_API_KEY or ARKESEL_SENDER_ID is not configured.");
    return {
      configured: false,
      attempted: uniqueRecipients.length,
      accepted: 0,
      failed: uniqueRecipients.length,
      skipped,
      error: "Arkesel SMS is not configured.",
    };
  }

  if (typeof message !== "string" || !message.trim()) {
    return {
      configured: true,
      attempted: uniqueRecipients.length,
      accepted: 0,
      failed: uniqueRecipients.length,
      skipped,
      error: "SMS message cannot be empty.",
    };
  }

  try {
    const response = await axios.post(
      process.env.ARKESEL_SMS_URL || "https://sms.arkesel.com/api/v2/sms/send",
      {
        sender,
        message: message.trim(),
        recipients: uniqueRecipients,
      },
      {
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 15000,
      }
    );

    const providerStatus = String(response.data?.status || "").toLowerCase();
    if (response.data?.success === false || ["failed", "error", "rejected"].includes(providerStatus)) {
      const safeMessage = typeof response.data?.message === "string"
        ? response.data.message.slice(0, 300)
        : "Arkesel rejected the SMS request.";
      logger.error(`Arkesel rejected SMS delivery for ${uniqueRecipients.length} recipient(s): ${safeMessage}`);
      return {
        configured: true,
        attempted: uniqueRecipients.length,
        accepted: 0,
        failed: uniqueRecipients.length,
        skipped,
        error: safeMessage,
      };
    }

    return {
      configured: true,
      attempted: uniqueRecipients.length,
      accepted: uniqueRecipients.length,
      failed: 0,
      skipped,
    };
  } catch (error) {
    const providerMessage = error.response?.data?.message || error.response?.data?.error;
    const safeMessage = typeof providerMessage === "string"
      ? providerMessage.slice(0, 300)
      : error.code === "ECONNABORTED"
        ? "Arkesel request timed out."
        : "Arkesel SMS request failed.";
    logger.error(`Arkesel SMS delivery failed for ${uniqueRecipients.length} recipient(s): ${safeMessage}`);
    return {
      configured: true,
      attempted: uniqueRecipients.length,
      accepted: 0,
      failed: uniqueRecipients.length,
      skipped,
      error: safeMessage,
    };
  }
};

module.exports = { sendSms, normalizePhone };
