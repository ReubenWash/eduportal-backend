const logger = require("../config/logger");

const MAX_MULTICAST_TOKENS = 500;
let firebaseApp = null;
let initializationAttempted = false;

const getFirebaseApp = () => {
  if (initializationAttempted) return firebaseApp;
  initializationAttempted = true;

  try {
    const admin = require("firebase-admin");
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let credential;

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
      }
      credential = admin.credential.cert(serviceAccount);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      credential = admin.credential.applicationDefault();
    } else {
      logger.info("Firebase Cloud Messaging is disabled: no service account credentials configured.");
      return null;
    }

    firebaseApp = admin.apps.some((app) => app.name === "[DEFAULT]")
      ? admin.app()
      : admin.initializeApp({
          credential,
          ...(process.env.FIREBASE_PROJECT_ID && { projectId: process.env.FIREBASE_PROJECT_ID }),
        });

    return firebaseApp;
  } catch (error) {
    logger.error(`Firebase Cloud Messaging initialization failed: ${error.message}`);
    return null;
  }
};

const isConfigured = () => Boolean(getFirebaseApp());

const chunksOf = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const isInvalidRegistrationToken = (error) => [
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
].includes(error?.code);

const sendPush = async (tokens, { title, body }) => {
  const uniqueTokens = [...new Set((tokens || []).filter((token) => typeof token === "string" && token.trim()))];
  if (uniqueTokens.length === 0) {
    return { delivered: false, reason: "no_device_tokens", successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const app = getFirebaseApp();
  if (!app) {
    return { delivered: false, reason: "not_configured", successCount: 0, failureCount: uniqueTokens.length, invalidTokens: [] };
  }

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];
  const admin = require("firebase-admin");

  for (const tokenBatch of chunksOf(uniqueTokens, MAX_MULTICAST_TOKENS)) {
    try {
      const response = await admin.messaging(app).sendEachForMulticast({
        tokens: tokenBatch,
        notification: { title, body },
      });

      successCount += response.successCount;
      failureCount += response.failureCount;
      response.responses.forEach((result, index) => {
        if (!result.success && isInvalidRegistrationToken(result.error)) {
          invalidTokens.push(tokenBatch[index]);
        }
      });
    } catch (error) {
      failureCount += tokenBatch.length;
      logger.error(`Firebase Cloud Messaging batch failed: ${error.message}`);
    }
  }

  return {
    delivered: successCount > 0,
    reason: successCount > 0 ? undefined : "delivery_failed",
    successCount,
    failureCount,
    invalidTokens,
  };
};

module.exports = { sendPush, isConfigured };
