import { CacheKeys } from "../../cache/cache-keys.js";
import type { CacheService } from "../../cache/redis.js";
import { env } from "../../config/env.js";
import type { AssetSearchResult, Candle, ChartRange, MarketTicker } from "../../types/market.js";
import type { ProviderStatus } from "../../types/provider.js";
import { circuitBreaker } from "../../utils/circuit-breaker.js";
import { nowIsoUtc, unixSecondsToIsoUtc } from "../../utils/dates.js";
import { toDecimalString } from "../../utils/decimal.js";
import { ProviderError } from "../../utils/errors.js";
import { quotaTracker } from "../../utils/quota.js";
import type { StockMarketProvider, StockQuoteQuery } from "../interfaces/stock-provider.js";
import { TwelveDataClient } from "./client.js";

function mapChartParams(range: ChartRange): { interval: string; outputsize: number } {
  switch (range) {
    case "1d":
      return { interval: "15min", outputsize: 32 };
    case "7d":
      return { interval: "1h", outputsize: 60 };
    case "30d":
      return { interval: "1day", outputsize: 30 };
    case "90d":
      return { interval: "1day", outputsize: 90 };
  }
}

export class TwelveDataProvider implements StockMarketProvider {
  readonly name = "twelvedata" as const;

  constructor(
    private readonly cache: CacheService,
    private readonly client: TwelveDataClient = new TwelveDataClient(),
  ) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  supportsMarket(_market: "IDX" | "US" | "GLOBAL"): boolean {
    return true;
  }

  async getQuote(query: StockQuoteQuery): Promise<MarketTicker | null> {
    if (!this.isConfigured()) return null;

    const symbol = query.symbol.trim().toUpperCase();
    const exchange = query.exchange?.trim().toUpperCase();
    const key = CacheKeys.stockQuote(this.name, symbol, exchange);
    const cached = await this.cache.get<MarketTicker>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) return { ...cached.value, isStale: true, fromStaleCache: true };
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      await quotaTracker.consume(this.name, "daily", env.TWELVE_DATA_DAILY_QUOTA, {
        isEssential: true,
      });
      const { quote, latencyMs } = await this.client.getQuote(symbol, exchange);
      circuitBreaker.recordSuccess(this.name, latencyMs);

      const resolvedExchange = quote.exchange ?? exchange ?? "GLOBAL";
      const currency = (
        quote.currency ?? (resolvedExchange === "IDX" ? "IDR" : "USD")
      ).toUpperCase();
      const sourceUpdatedAt =
        unixSecondsToIsoUtc(quote.timestamp) ??
        (quote.datetime ? new Date(quote.datetime.replace(" ", "T") + "Z").toISOString() : undefined);

      const ticker: MarketTicker = {
        provider: "twelvedata",
        assetClass: "stock",
        assetId: resolvedExchange === "IDX" ? `${quote.symbol.toUpperCase()}:IDX` : quote.symbol.toUpperCase(),
        symbol: quote.symbol.toUpperCase(),
        name: quote.name,
        exchange: resolvedExchange,
        quoteCurrency: currency,
        price: toDecimalString(quote.close),
        previousClose: quote.previous_close ? toDecimalString(quote.previous_close) : undefined,
        change24h: quote.change ? toDecimalString(quote.change) : undefined,
        change24hPercent: quote.percent_change ? toDecimalString(quote.percent_change) : undefined,
        high24h: quote.high ? toDecimalString(quote.high) : undefined,
        low24h: quote.low ? toDecimalString(quote.low) : undefined,
        open: quote.open ? toDecimalString(quote.open) : undefined,
        volume24h: quote.volume ? toDecimalString(quote.volume) : undefined,
        isMarketOpen: quote.is_market_open,
        dataFeedType: "delayed_or_eod",
        sourceLabel: `Sumber: Twelve Data (${resolvedExchange}) — delayed/EOD sesuai plan`,
        sourceUpdatedAt,
        fetchedAt: nowIsoUtc(),
        isStale: false,
      };

      const ttl = resolvedExchange === "IDX" ? env.STOCK_GLOBAL_QUOTE_TTL : env.STOCK_US_QUOTE_TTL;
      await this.cache.set(key, ticker, ttl, 3600);
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
      await quotaTracker.consume(this.name, "daily", env.TWELVE_DATA_DAILY_QUOTA, {
        isEssential: true,
      });
      const { results, latencyMs } = await this.client.search(clean);
      circuitBreaker.recordSuccess(this.name, latencyMs);

      const mapped: AssetSearchResult[] = results
        .filter((r) => !r.instrument_type || r.instrument_type.toLowerCase().includes("stock") || r.instrument_type.toLowerCase().includes("etf") || r.instrument_type.toLowerCase().includes("depositary"))
        .slice(0, Math.max(limit, 10))
        .map((r) => {
          const ex = (r.exchange ?? "").toUpperCase();
          const isIdx = ex === "IDX" || r.mic_code === "XIDX";
          const isUs = ex === "NASDAQ" || ex === "NYSE" || r.country === "United States";
          return {
            provider: "twelvedata",
            assetClass: "stock",
            assetId: isIdx ? `${r.symbol.toUpperCase()}:IDX` : r.symbol.toUpperCase(),
            symbol: r.symbol.toUpperCase(),
            name: r.instrument_name,
            exchange: ex || undefined,
            market: isIdx ? "IDX" : isUs ? "US" : "GLOBAL",
            currency: r.currency?.toUpperCase(),
          };
        });

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

  async getHistoricalCandles(query: StockQuoteQuery, range: ChartRange): Promise<Candle[]> {
    if (!this.isConfigured()) return [];

    const symbol = query.symbol.trim().toUpperCase();
    const exchange = query.exchange?.trim().toUpperCase();
    const key = CacheKeys.stockSeries(this.name, `${symbol}:${exchange ?? "ANY"}`, range);
    const cached = await this.cache.get<Candle[]>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      return cached ? cached.value : [];
    }

    try {
      await quotaTracker.consume(this.name, "daily", env.TWELVE_DATA_DAILY_QUOTA, {
        isEssential: false,
      });
      const { interval, outputsize } = mapChartParams(range);
      const { series, latencyMs } = await this.client.getTimeSeries(
        symbol,
        interval,
        outputsize,
        exchange,
      );
      circuitBreaker.recordSuccess(this.name, latencyMs);

      const candles: Candle[] = [...series.values]
        .reverse()
        .map((v) => ({
          timestamp: v.datetime.includes(" ")
            ? new Date(v.datetime.replace(" ", "T") + "Z").toISOString()
            : new Date(`${v.datetime}T00:00:00Z`).toISOString(),
          open: toDecimalString(v.open),
          high: toDecimalString(v.high),
          low: toDecimalString(v.low),
          close: toDecimalString(v.close),
          volume: v.volume ? toDecimalString(v.volume) : undefined,
        }));

      await this.cache.set(key, candles, 900, 7200);
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
        detail: "Set TWELVE_DATA_API_KEY untuk saham IDX & Global",
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
