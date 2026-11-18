import { CacheKeys } from "../../cache/cache-keys.js";
import type { CacheService } from "../../cache/redis.js";
import { env } from "../../config/env.js";
import type { AssetSearchResult, MarketTicker } from "../../types/market.js";
import type { ProviderStatus } from "../../types/provider.js";
import { circuitBreaker } from "../../utils/circuit-breaker.js";
import { nowIsoUtc } from "../../utils/dates.js";
import { toDecimalString } from "../../utils/decimal.js";
import { ProviderError } from "../../utils/errors.js";
import { quotaTracker } from "../../utils/quota.js";
import type { StockMarketProvider, StockQuoteQuery } from "../interfaces/stock-provider.js";
import { AlphaVantageClient } from "./client.js";

export class AlphaVantageProvider implements StockMarketProvider {
  readonly name = "alphavantage" as const;

  constructor(
    private readonly cache: CacheService,
    private readonly client: AlphaVantageClient = new AlphaVantageClient(),
  ) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  supportsMarket(market: "IDX" | "US" | "GLOBAL"): boolean {
    return market === "US" || market === "GLOBAL";
  }

  async getQuote(query: StockQuoteQuery): Promise<MarketTicker | null> {
    if (!this.isConfigured()) return null;

    const rawSymbol = query.symbol.trim().toUpperCase();
    const apiSymbol = query.exchange === "IDX" && !rawSymbol.endsWith(".JK") ? `${rawSymbol}.JK` : rawSymbol;
    const key = CacheKeys.stockQuote(this.name, apiSymbol);
    const cached = await this.cache.get<MarketTicker>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) return { ...cached.value, isStale: true, fromStaleCache: true };
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      await quotaTracker.consume(this.name, "daily", env.ALPHA_VANTAGE_DAILY_QUOTA, {
        isEssential: true,
      });
      const { quote, latencyMs } = await this.client.getGlobalQuote(apiSymbol);
      circuitBreaker.recordSuccess(this.name, latencyMs);

      const priceRaw = quote?.["05. price"];
      if (!quote || !priceRaw) {
        return null;
      }

      const pctRaw = quote["10. change percent"]?.replace("%", "").trim();
      const tradingDay = quote["07. latest trading day"];
      const sourceUpdatedAt = tradingDay ? `${tradingDay}T00:00:00Z` : undefined;

      const ticker: MarketTicker = {
        provider: "alphavantage",
        assetClass: "stock",
        assetId: apiSymbol,
        symbol: rawSymbol,
        exchange: query.exchange ?? (apiSymbol.endsWith(".JK") ? "IDX" : "US"),
        quoteCurrency: apiSymbol.endsWith(".JK") ? "IDR" : "USD",
        price: toDecimalString(priceRaw),
        previousClose: quote["08. previous close"] ? toDecimalString(quote["08. previous close"]) : undefined,
        change24h: quote["09. change"] ? toDecimalString(quote["09. change"]) : undefined,
        change24hPercent: pctRaw ? toDecimalString(pctRaw) : undefined,
        high24h: quote["03. high"] ? toDecimalString(quote["03. high"]) : undefined,
        low24h: quote["04. low"] ? toDecimalString(quote["04. low"]) : undefined,
        open: quote["02. open"] ? toDecimalString(quote["02. open"]) : undefined,
        volume24h: quote["06. volume"] ? toDecimalString(quote["06. volume"]) : undefined,
        dataFeedType: "eod",
        sourceLabel: "Sumber: Alpha Vantage — EOD/delayed",
        sourceUpdatedAt,
        fetchedAt: nowIsoUtc(),
        isStale: false,
      };

      // Cache aggressively because free tier is 25 req/day
      await this.cache.set(key, ticker, 3600, 86400);
      return ticker;
    } catch (error) {
      if (error instanceof ProviderError && error.statusCode === 404) {
        return null;
      }
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
      await quotaTracker.consume(this.name, "daily", env.ALPHA_VANTAGE_DAILY_QUOTA, {
        isEssential: false,
      });
      const { matches, latencyMs } = await this.client.searchSymbols(clean);
      circuitBreaker.recordSuccess(this.name, latencyMs);

      const mapped: AssetSearchResult[] = matches.slice(0, limit).map((m) => ({
        provider: "alphavantage",
        assetClass: "stock",
        assetId: m["1. symbol"].toUpperCase(),
        symbol: m["1. symbol"].toUpperCase(),
        name: m["2. name"],
        market: m["1. symbol"].endsWith(".JK") ? "IDX" : m["4. region"] === "United States" ? "US" : "GLOBAL",
        currency: m["8. currency"]?.toUpperCase(),
      }));

      await this.cache.set(key, mapped, 86400, 86400 * 3);
      return mapped;
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
        detail: "Opsional: set ALPHA_VANTAGE_API_KEY (25 req/hari, EOD)",
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
