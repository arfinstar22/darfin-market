import { CacheKeys } from "../../cache/cache-keys.js";
import type { CacheService } from "../../cache/redis.js";
import { POPULAR_IDX_STOCKS } from "../../config/constants.js";
import { env } from "../../config/env.js";
import type { AssetSearchResult, Candle, ChartRange, MarketTicker } from "../../types/market.js";
import type { ProviderStatus } from "../../types/provider.js";
import { circuitBreaker } from "../../utils/circuit-breaker.js";
import { nowIsoUtc } from "../../utils/dates.js";
import { calculatePercentChange, toDecimalString } from "../../utils/decimal.js";
import { ProviderError } from "../../utils/errors.js";
import { quotaTracker } from "../../utils/quota.js";
import type { StockMarketProvider, StockQuoteQuery } from "../interfaces/stock-provider.js";
import { GoApiClient } from "./client.js";
import type { GoApiPriceItem } from "./schemas.js";

const RANGE_DAYS: Record<ChartRange, number> = {
  "1d": 5, // daily candles need at least a few trading days to draw a curve
  "7d": 10,
  "30d": 35,
  "90d": 95,
};

export class GoApiIdxProvider implements StockMarketProvider {
  readonly name = "goapi" as const;

  constructor(
    private readonly cache: CacheService,
    private readonly client: GoApiClient = new GoApiClient(),
  ) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  supportsMarket(market: "IDX" | "US" | "GLOBAL"): boolean {
    return market === "IDX";
  }

  private mapPriceItem(item: GoApiPriceItem, fetchedAt: string, fromStaleCache = false): MarketTicker | null {
    const rawPrice = item.price ?? item.close;
    if (!rawPrice) return null;

    const sym = item.symbol.trim().toUpperCase().replace(".JK", "");
    const curated = POPULAR_IDX_STOCKS.find((s) => s.symbol === sym);
    const priceStr = toDecimalString(rawPrice);
    const prevClose = item.previous_close
      ? toDecimalString(item.previous_close)
      : item.open
        ? toDecimalString(item.open)
        : undefined;

    const rawPct = item.percent_change ?? item.change_pct;
    const change24hPercent =
      rawPct !== undefined
        ? toDecimalString(rawPct)
        : prevClose
          ? calculatePercentChange(priceStr, prevClose)
          : undefined;

    const sourceUpdatedAt = item.last_updated
      ? new Date(item.last_updated).toISOString()
      : item.date
        ? new Date(`${item.date.slice(0, 10)}T09:00:00Z`).toISOString()
        : undefined;

    return {
      provider: "goapi",
      assetClass: "stock",
      assetId: `${sym}:IDX`,
      symbol: sym,
      name: item.company?.name ?? item.name ?? curated?.name,
      exchange: "IDX",
      quoteCurrency: "IDR",
      price: priceStr,
      previousClose: prevClose,
      change24h: item.change ? toDecimalString(item.change) : undefined,
      change24hPercent,
      open: item.open ? toDecimalString(item.open) : undefined,
      high24h: item.high ? toDecimalString(item.high) : undefined,
      low24h: item.low ? toDecimalString(item.low) : undefined,
      volume24h: item.volume ? toDecimalString(item.volume) : undefined,
      dataFeedType: "delayed_or_eod",
      sourceLabel: "Sumber: GoAPI.io (IDX) — delay 3-10 menit",
      sourceUpdatedAt,
      fetchedAt,
      isStale: fromStaleCache,
      fromStaleCache,
    };
  }

  async getBatchQuotes(symbols: string[]): Promise<Map<string, MarketTicker>> {
    const resultMap = new Map<string, MarketTicker>();
    if (!this.isConfigured() || symbols.length === 0) return resultMap;

    const cleanSymbols = Array.from(
      new Set(symbols.map((s) => s.trim().toUpperCase().replace(".JK", "").replace(":IDX", ""))),
    );

    const missing: string[] = [];
    const staleFallbacks = new Map<string, MarketTicker>();

    for (const sym of cleanSymbols) {
      const cached = await this.cache.get<MarketTicker>(CacheKeys.stockQuote(this.name, sym, "IDX"));
      if (cached && !cached.isStale) {
        resultMap.set(sym, cached.value);
      } else {
        missing.push(sym);
        if (cached) {
          staleFallbacks.set(sym, { ...cached.value, isStale: true, fromStaleCache: true });
        }
      }
    }

    if (missing.length === 0) {
      return resultMap;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      for (const [sym, fallback] of staleFallbacks) {
        resultMap.set(sym, fallback);
      }
      if (resultMap.size > 0) return resultMap;
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      await quotaTracker.consume(this.name, "daily", env.GOAPI_DAILY_QUOTA, { isEssential: true });
      const { results, latencyMs } = await this.client.getPrices(missing);
      circuitBreaker.recordSuccess(this.name, latencyMs);

      const fetchedAt = nowIsoUtc();
      for (const raw of results) {
        const mapped = this.mapPriceItem(raw, fetchedAt, false);
        if (!mapped) continue;
        resultMap.set(mapped.symbol, mapped);
        await this.cache.set(
          CacheKeys.stockQuote(this.name, mapped.symbol, "IDX"),
          mapped,
          env.STOCK_GLOBAL_QUOTE_TTL,
          3600,
        );
      }
      return resultMap;
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      if (staleFallbacks.size > 0) {
        for (const [sym, fallback] of staleFallbacks) {
          resultMap.set(sym, fallback);
        }
        return resultMap;
      }
      throw error;
    }
  }

  async getQuote(query: StockQuoteQuery): Promise<MarketTicker | null> {
    if (!this.isConfigured()) return null;
    const sym = query.symbol.trim().toUpperCase().replace(".JK", "").replace(":IDX", "");
    const batch = await this.getBatchQuotes([sym]);
    return batch.get(sym) ?? null;
  }

  async searchStocks(query: string, limit = 8): Promise<AssetSearchResult[]> {
    if (!this.isConfigured()) return [];
    const clean = query.trim().toUpperCase();
    if (!clean) return [];

    const catalogKey = "goapi:idx:companies";
    let companies: Array<{ symbol: string; name: string }> = [];
    const cached = await this.cache.get<Array<{ symbol: string; name: string }>>(catalogKey);

    if (cached && !cached.isStale) {
      companies = cached.value;
    } else if (circuitBreaker.canExecute(this.name)) {
      try {
        await quotaTracker.consume(this.name, "daily", env.GOAPI_DAILY_QUOTA, { isEssential: false });
        const { companies: fetched, latencyMs } = await this.client.getCompanies();
        circuitBreaker.recordSuccess(this.name, latencyMs);
        companies = fetched;
        await this.cache.set(catalogKey, companies, 86_400, 86_400 * 7);
      } catch (error) {
        circuitBreaker.recordFailure(
          this.name,
          error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
        );
        companies = cached ? cached.value : [];
      }
    } else if (cached) {
      companies = cached.value;
    }

    return companies
      .filter((c) => c.symbol.toUpperCase().includes(clean) || c.name.toUpperCase().includes(clean))
      .slice(0, limit)
      .map((c) => ({
        provider: "goapi",
        assetClass: "stock",
        assetId: `${c.symbol.toUpperCase()}:IDX`,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        exchange: "IDX",
        market: "IDX",
        currency: "IDR",
      }));
  }

  async getHistoricalCandles(query: StockQuoteQuery, range: ChartRange): Promise<Candle[]> {
    if (!this.isConfigured()) return [];
    const sym = query.symbol.trim().toUpperCase().replace(".JK", "").replace(":IDX", "");
    const key = CacheKeys.stockSeries(this.name, sym, range);
    const cached = await this.cache.get<Candle[]>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      return cached ? cached.value : [];
    }

    try {
      await quotaTracker.consume(this.name, "daily", env.GOAPI_DAILY_QUOTA, { isEssential: false });
      const to = new Date();
      const from = new Date(to.getTime() - RANGE_DAYS[range] * 86_400_000);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = to.toISOString().slice(0, 10);

      const { rows, latencyMs } = await this.client.getHistorical(sym, fromStr, toStr);
      circuitBreaker.recordSuccess(this.name, latencyMs);

      const candles: Candle[] = rows
        .map((r) => ({
          timestamp: new Date(`${r.date.slice(0, 10)}T09:00:00Z`).toISOString(),
          open: toDecimalString(r.open),
          high: toDecimalString(r.high),
          low: toDecimalString(r.low),
          close: toDecimalString(r.close),
          volume: r.volume ? toDecimalString(r.volume) : undefined,
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      await this.cache.set(key, candles, 1800, 14400);
      return candles;
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      return cached ? cached.value : [];
    }
  }

  getProviderStatus(): ProviderStatus {
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        status: "unconfigured",
        configured: false,
        detail: "Set GOAPI_API_KEY untuk saham Indonesia (IDX)",
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
