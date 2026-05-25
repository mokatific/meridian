/**
 * Robust retry wrapper for OpenAI-compatible LLM calls (OpenRouter, LM Studio, etc.)
 *
 * Features:
 * - Exponential backoff + jitter
 * - Smart classification of retryable errors (5xx, 429, network issues)
 * - Does not retry on client errors (4xx except rate limit)
 * - Configurable via config.llm.maxRetries and config.llm.retryBaseDelayMs
 * - Clean logging
 */

import { log } from "../logger.js";
import { config } from "../config.js";

export async function createChatCompletionWithRetry(client, params, overrides = {}) {
  const maxRetries = overrides.maxRetries ?? config.llm?.maxRetries ?? 4;
  const baseDelay = overrides.baseDelayMs ?? config.llm?.retryBaseDelayMs ?? 1200;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (error) {
      lastError = error;

      const status = error?.status || error?.response?.status;
      const message = String(error?.message || error?.error?.message || error || "");

      // These special errors are handled by the caller (agentLoop)
      if (/invalid message role:\s*system/i.test(message)) {
        throw error;
      }
      if (/tool_choice/i.test(message) && /required/i.test(message)) {
        throw error;
      }

      const isRetryable =
        status === 429 ||
        (status >= 500 && status < 600) ||
        /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|aborted|rate.?limit/i.test(
          message,
        );

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter (capped at ~30s)
      const exponential = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 900;
      const delay = Math.min(exponential + jitter, 30000);

      log(
        "agent",
        `LLM transient error (status=${status || "N/A"}) — retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${maxRetries + 1})`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
