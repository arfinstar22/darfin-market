import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  name: "darfin-market",
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "token",
      "apiKey",
      "apikey",
      "password",
      "authorization",
      "TELEGRAM_BOT_TOKEN",
      "DATABASE_URL",
      "FINNHUB_API_KEY",
      "TWELVE_DATA_API_KEY",
      "ALPHA_VANTAGE_API_KEY",
      "GOAPI_API_KEY",
      "*.token",
      "*.apiKey",
      "*.apikey",
      "*.password",
      "*.authorization",
      "headers.authorization",
      "headers['x-finnhub-token']",
      "headers['x-api-key']",
    ],
    censor: "[REDACTED]",
  },
  base: {
    app: env.APP_NAME,
    env: env.NODE_ENV,
  },
});

export function sanitizeUrlForLog(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    for (const key of ["apikey", "api_key", "token", "key", "secret"]) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "REDACTED");
      }
    }
    return parsed.toString();
  } catch {
    return "[INVALID_URL]";
  }
}
