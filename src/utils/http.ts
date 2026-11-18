import dns from "node:dns";
import { env } from "../config/env.js";
import { ProviderError } from "./errors.js";
import { logger, sanitizeUrlForLog } from "./logger.js";

// Prevent slow/hanging IPv6 stalls on VPS & Linux networks with incomplete IPv6 routing
dns.setDefaultResultOrder("ipv4first");

export interface HttpFetchOptions {
  provider: string;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 30_000);
  }
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? Math.min(delta, 30_000) : 0;
  }
  return undefined;
}

function backoffWithJitter(attempt: number): number {
  const baseMs = Math.min(400 * 2 ** attempt, 4000);
  const jitter = Math.floor(Math.random() * 250);
  return baseMs + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  options: HttpFetchOptions,
): Promise<{ data: T; latencyMs: number; status: number }> {
  const timeoutMs = options.timeoutMs ?? env.PROVIDER_HTTP_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? 2;
  const safeUrl = sanitizeUrlForLog(url);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "DARFIN-MARKET/1.0",
          ...options.headers,
        },
        signal: controller.signal,
      });

      const latencyMs = Date.now() - started;

      if (response.ok) {
        const data = (await response.json()) as T;
        return { data, latencyMs, status: response.status };
      }

      const retryable = RETRYABLE_STATUS.has(response.status);
      if (retryable && attempt < maxRetries) {
        const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
        const delayMs = retryAfter ?? backoffWithJitter(attempt);
        logger.warn(
          { provider: options.provider, status: response.status, attempt, delayMs, url: safeUrl },
          "Provider transient HTTP error, retrying",
        );
        await sleep(delayMs);
        continue;
      }

      throw new ProviderError(
        options.provider,
        `HTTP ${response.status} from ${safeUrl}`,
        response.status,
        retryable,
      );
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      lastError = error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      if (attempt < maxRetries) {
        const delayMs = backoffWithJitter(attempt);
        logger.warn(
          {
            provider: options.provider,
            attempt,
            delayMs,
            timeout: isAbort,
            url: safeUrl,
            err: error instanceof Error ? error.message : String(error),
          },
          "Provider network/timeout error, retrying",
        );
        await sleep(delayMs);
        continue;
      }

      throw new ProviderError(
        options.provider,
        isAbort ? `Request timeout after ${timeoutMs}ms` : `Network error: ${String(error)}`,
        isAbort ? 408 : undefined,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new ProviderError(options.provider, `Unexpected retry failure: ${String(lastError)}`);
}
