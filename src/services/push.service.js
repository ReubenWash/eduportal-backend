/**
 * Push notification delivery via Firebase Cloud Messaging.
 *
 * This module is provider-agnostic at the call site: sendPush() always
 * resolves to a result object and never throws, so callers (e.g. the
 * mass-broadcast flow) can safely call it without wrapping every push
 * attempt in try/catch.
 *
 * To actually deliver pushes:
 *   1. npm install firebase-admin
 *   2. Set FIREBASE_SERVICE_ACCOUNT_JSON in your environment to the
 *      full JSON contents of a Firebase service account key
 *      (Project Settings → Service Accounts → Generate new private key).
 *   3. Restart the server.
 *
 * Until both of those are done, sendPush() reports { delivered: false,
 * reason: "not_configured" } and callers should treat the push as a
 * no-op (in-app notifications still work independently of this).
 */
const logger = require("../config/logger");

let firebaseApp = null;
let initAttempted = false;

const getFirebaseApp = () => {
  if (initAttempted) return firebaseApp;
  initAttempted = true;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return null;

  try {
    // Lazy require: don't force firebase-admin as a hard dependency for
    // installs that never configure push.
    const admin = require("firebase-admin");
    const serviceAccount = JSON.parse(serviceAccountJson);

    firebaseApp = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

    return firebaseApp;
  } catch (err) {
    logger.warn(`Push notifications not available: ${err.message}`);
    return null;
  }
};

const isConfigured = () => !!getFirebaseApp();

/**
 * @param {string[]} tokens - Device tokens to send to.
 * @param {{title: string, body: string}} payload
 * @returns {Promise<{delivered: boolean, reason?: string, successCount?: number, failureCount?: number, invalidTokens?: string[]}>}
 */
const sendPush = async (tokens, { title, body }) => {
  if (!tokens || tokens.length === 0) {
    return { delivered: false, reason: "no_device_tokens" };
  }

  const app = getFirebaseApp();
  if (!app) {
    return { delivered: false, reason: "not_configured" };
  }

  try {
    const admin = require("firebase-admin");
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
    });

    const invalidTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || "";
        if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
          invalidTokens.push(tokens[i]);
        }
      }
    });

    return {
      delivered: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (err) {
    logger.error(`Push send failed: ${err.message}`);
    return { delivered: false, reason: "send_error", error: err.message };
  }
};

module.exports = { sendPush, isConfigured };
