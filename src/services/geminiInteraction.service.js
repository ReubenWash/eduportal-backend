const axios = require("axios");
const { createError } = require("../middleware/errorHandler");
const logger = require("../config/logger");

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_GEMINI_MODEL = "gemini-3.8-flash";
const configuredTimeout = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS);
const GEMINI_REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? Math.min(configuredTimeout, 20000)
  : 15000;

const getGeminiModelCandidates = () => {
  const configured = (process.env.GEMINI_MODEL || "").trim().replace(/^models\//i, "");
  return [...new Set([configured, DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL].filter(Boolean))];
};

const getOutputText = (interaction) => (interaction?.steps || [])
  .filter((step) => step.type === "model_output")
  .flatMap((step) => step.content || [])
  .filter((content) => content.type === "text" && typeof content.text === "string")
  .map((content) => content.text)
  .join("")
  .trim();

const generateGeminiJson = async ({
  prompt,
  schema,
  temperature,
  maxOutputTokens,
  requestName,
}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw createError("The study assistant is not configured. Set GEMINI_API_KEY on the backend.", 503);
  }

  const models = getGeminiModelCandidates();
  const startedAt = Date.now();
  let lastError;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const response = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          model,
          input: prompt,
          store: false,
          generation_config: {
            temperature,
            max_output_tokens: maxOutputTokens,
            ...(model === "gemini-3.5-flash-lite"
              ? { thinking_level: "minimal" }
              : model.startsWith("gemini-3.")
                ? { thinking_level: "low" }
                : {}),
          },
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema,
          },
        },
        {
          timeout: GEMINI_REQUEST_TIMEOUT_MS,
          headers: {
            "Content-Type": "application/json",
            "Api-Revision": "2026-05-20",
            "x-goog-api-key": apiKey,
          },
        }
      );

      const generatedText = getOutputText(response.data);
      if (!generatedText) {
        throw createError("The study assistant returned an empty response. Please try again.", 502);
      }

      let result;
      try {
        result = JSON.parse(generatedText);
      } catch {
        throw createError("The study assistant returned an invalid response. Please try again.", 502);
      }
      logger.info(`Gemini ${requestName} succeeded: model=${model}, duration=${Date.now() - startedAt}ms`);
      return result;
    } catch (error) {
      if (error.statusCode) throw error;

      lastError = error;
      const providerStatus = error.response?.status;
      const providerMessage = String(
        error.response?.data?.error?.message
          || error.response?.data?.message
          || error.message
          || "Unknown provider error"
      ).replace(/[\r\n]+/g, " ").slice(0, 400);
      logger.error(
        `Gemini ${requestName} failed: model=${model}, duration=${Date.now() - startedAt}ms, status=${providerStatus || "network"}, code=${error.code || "none"}, message=${providerMessage}`
      );

      if (providerStatus === 429) {
        throw createError("The study assistant is busy. Please try again shortly.", 429);
      }
      if (providerStatus === 401 || providerStatus === 403) {
        throw createError("The study assistant provider rejected its backend credentials. Check GEMINI_API_KEY.", 503);
      }

      const shouldTryFallback = index < models.length - 1
        && (providerStatus === 400
          || providerStatus === 404
          || providerStatus >= 500
          || error.code === "ECONNABORTED"
          || ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(error.code));
      if (shouldTryFallback) continue;

      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        throw createError("The study assistant timed out. Please try again shortly.", 504);
      }
      if (["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED"].includes(error.code)) {
        throw createError("The study assistant provider is temporarily unreachable. Please try again later.", 502);
      }
      if (providerStatus === 400 || providerStatus === 404) {
        throw createError("Gemini rejected the request or model. Check GEMINI_MODEL and model availability in Render.", 502);
      }
      throw createError("The study assistant could not answer right now. Please try again later.", 502);
    }
  }

  if (lastError?.code === "ECONNABORTED" || lastError?.code === "ETIMEDOUT") {
    throw createError("The study assistant timed out. Please try again shortly.", 504);
  }
  throw createError("The study assistant could not answer right now. Please try again later.", 502);
};

module.exports = { generateGeminiJson };
