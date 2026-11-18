import { CacheKeys } from "../../cache/cache-keys.js";
import type { CacheService } from "../../cache/redis.js";
import { POPULAR_US_STOCKS } from "../../config/constants.js";
import { env } from "../../config/env.js";
import type { AssetSearchResult, MarketTicker } from "../../types/market.js";
import type { ProviderStatus } from "../../types/provider.js";
import { circuitBreaker } from "../../utils/circuit-breaker.js";
import { nowIsoUtc, unixSecondsToIsoUtc } from "../../utils/dates.js";
import { toDecimalString } from "../../utils/decimal.js";
import { ProviderError } from "../../utils/errors.js";
import type { StockMarketProvider, StockQuoteQuery } from "../interfaces/stock-provider.js";
import { FinnhubClient } from "./client.js";

export class FinnhubProvider implements StockMarketProvider {
  readonly name = "finnhub" as const;

  constructor(
    private readonly cache: CacheService,
    private readonly client: FinnhubClient = new FinnhubClient(),
  ) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  supportsMarket(market: "IDX" | "US" | "GLOBAL"): boolean {
    return market === "US";
  }

  async getQuote(query: StockQuoteQuery): Promise<MarketTicker | null> {
    if (!this.isConfigured()) return null;

    const symbol = query.symbol.trim().toUpperCase();
    const key = CacheKeys.stockQuote(this.name, symbol, "US");
    const cached = await this.cache.get<MarketTicker>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) return { ...cached.value, isStale: true, fromStaleCache: true };
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      const { quote, latencyMs } = await this.client.getQuote(symbol);
      circuitBreaker.recordSuccess(this.name, latencyMs);

      // Finnhub returns c=0 and t=0 when symbol does not exist or has no quote
      if (quote.c <= 0 || quote.t <= 0) {
        return null;
      }

      const curated = POPULAR_US_STOCKS.find((s) => s.symbol === symbol);
      const sourceUpdatedAt = unixSecondsToIsoUtc(quote.t);
      const fetchedAt = nowIsoUtc();

      const ticker: MarketTicker = {
        provider: "finnhub",
        assetClass: "stock",
        assetId: symbol,
        symbol,
        name: curated?.name,
        exchange: curated?.exchange ?? "US",
        quoteCurrency: "USD",
        price: toDecimalString(quote.c),
        previousClose:
          quote.pc !== null && quote.pc !== undefined && quote.pc > 0
            ? toDecimalString(quote.pc)
            : undefined,
        change24h:
          quote.d !== null && quote.d !== undefined ? toDecimalString(quote.d) : undefined,
        change24hPercent:
          quote.dp !== null && quote.dp !== undefined ? toDecimalString(quote.dp) : undefined,
        high24h:
          quote.h !== null && quote.h !== undefined && quote.h > 0
            ? toDecimalString(quote.h)
            : undefined,
        low24h:
          quote.l !== null && quote.l !== undefined && quote.l > 0
            ? toDecimalString(quote.l)
            : undefined,
        open:
          quote.o !== null && quote.o !== undefined && quote.o > 0
            ? toDecimalString(quote.o)
            : undefined,
        dataFeedType: "realtime_us",
        sourceLabel: "Sumber: Finnhub — US real-time/last trade",
        sourceUpdatedAt,
        fetchedAt,
        isStale: false,
      };

      await this.cache.set(key, ticker, env.STOCK_US_QUOTE_TTL, 3600);
      return ticker;
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      if (cached) return { ...cached.value, isStale: true, fromStaleCache: true };
      throw error;
    }
  }

  async searchStocks(query: string, limit = 8): Promise<AssetSearchResult[]> {
    if (!this.isConfigured()) return [];
    const clean = query.trim();
    if (!clean) return [];

    const key = CacheKeys.stockSearch(this.name, clean);
    const cached = await this.cache.get<AssetSearchResult[]>(key);
    if (cached && !cached.isStale) {
      return cached.value.slice(0, limit);
    }

    if (!circuitBreaker.canExecute(this.name)) {
      return cached ? cached.value.slice(0, limit) : [];
    }

    try {
      const { results, latencyMs } = await this.client.search(clean);
      circuitBreaker.recordSuccess(this.name, latencyMs);
      const mapped: AssetSearchResult[] = results
        .filter((r) => !r.symbol.includes(".") || r.symbol.endsWith(".B") || r.symbol.endsWith(".A"))
        .slice(0, Math.max(limit, 10))
        .map((r) => ({
          provider: "finnhub",
          assetClass: "stock",
          assetId: r.symbol.toUpperCase(),
          symbol: r.displaySymbol.toUpperCase(),
          name: r.description,
          exchange: "US",
          market: "US",
          currency: "USD",
        }));
      await this.cache.set(key, mapped, 3600, 14400);
      return mapped.slice(0, limit);
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      return cached ? cached.value.slice(0, limit) : [];
    }
  }

  getProviderStatus(): ProviderStatus {
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        status: "unconfigured",
        configured: false,
        detail: "Set FINNHUB_API_KEY untuk saham US real-time",
      };
    }
    const snap = circuitBreaker.getSnapshot(this.name);
    return {
      provider: this.name,
      status: snap.state,
      configured: true,
      lastSuccessAt: snap.lastSuccessAt,
      lastErrorAt: snap.lastErrorAt,
      lastErrorCode: snap.lastErrorCode,
      latencyMs: snap.latencyMs,
    };
  }
}
