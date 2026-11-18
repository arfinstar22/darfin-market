import { env } from "../../config/env.js";
import { fetchJsonWithRetry } from "../../utils/http.js";
import {
  coinPaprikaGlobalSchema,
  coinPaprikaOhlcvResponseSchema,
  coinPaprikaSearchResponseSchema,
  coinPaprikaTickerSchema,
  coinPaprikaTickersResponseSchema,
} from "./schemas.js";

export class CoinPaprikaClient {
  constructor(private readonly baseUrl: string = env.COINPAPRIKA_BASE_URL) {}

  async getGlobal() {
    const { data, latencyMs } = await fetchJsonWithRetry(`${this.baseUrl}/global`, {
      provider: "coinpaprika",
    });
    return { global: coinPaprikaGlobalSchema.parse(data), latencyMs };
  }

  async getTickers() {
    const { data, latencyMs } = await fetchJsonWithRetry(`${this.baseUrl}/tickers`, {
      provider: "coinpaprika",
      timeoutMs: Math.max(env.PROVIDER_HTTP_TIMEOUT_MS, 12_000),
    });
    return { tickers: coinPaprikaTickersResponseSchema.parse(data), latencyMs };
  }

  async getTicker(coinId: string) {
    const safeId = encodeURIComponent(coinId.trim().toLowerCase());
    const { data, latencyMs } = await fetchJsonWithRetry(`${this.baseUrl}/tickers/${safeId}`, {
      provider: "coinpaprika",
    });
    return { ticker: coinPaprikaTickerSchema.parse(data), latencyMs };
  }

  async search(query: string, limit = 10) {
    const params = new URLSearchParams({
      q: query.trim(),
      c: "currencies",
      limit: String(limit),
    });
    // Note: trailing slash on /search/ avoids CoinPaprika 301 redirect
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/search/?${params.toString()}`,
      { provider: "coinpaprika" },
    );
    return { results: coinPaprikaSearchResponseSchema.parse(data).currencies, latencyMs };
  }

  async getOhlcvLatest(coinId: string) {
    const safeId = encodeURIComponent(coinId.trim().toLowerCase());
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/coins/${safeId}/ohlcv/latest`,
      { provider: "coinpaprika" },
    );
    return { candles: coinPaprikaOhlcvResponseSchema.parse(data), latencyMs };
  }
}
