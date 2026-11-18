import YahooFinance from "yahoo-finance2";
import { CacheKeys } from "../../cache/cache-keys.js";
import type { CacheService } from "../../cache/redis.js";
import { POPULAR_IDX_STOCKS } from "../../config/constants.js";
import { env } from "../../config/env.js";
import type { AssetSearchResult, Candle, ChartRange, MarketTicker } from "../../types/market.js";
import type { ProviderStatus } from "../../types/provider.js";
import { circuitBreaker } from "../../utils/circuit-breaker.js";
import { nowIsoUtc } from "../../utils/dates.js";
import { toDecimalString } from "../../utils/decimal.js";
import { ProviderError } from "../../utils/errors.js";
import type { StockMarketProvider, StockQuoteQuery } from "../interfaces/stock-provider.js";

export interface YahooRawQuote {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  exchange?: string;
  fullExchangeName?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketTime?: Date | number;
  marketState?: string;
}

export interface YahooClientAdapter {
  quote(symbols: string[]): Promise<YahooRawQuote[]>;
  chart(
    symbol: string,
    range: ChartRange,
  ): Promise<
    Array<{
      date: Date;
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume?: number | null;
    }>
  >;
  search(query: string): Promise<Array<{ symbol?: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }>>;
}

function getChartParams(range: ChartRange): {
  period1: Date;
  interval: "15m" | "1h" | "1d";
} {
  const now = Date.now();
  switch (range) {
    case "1d":
      return { period1: new Date(now - 2 * 86_400_000), interval: "15m" };
    case "7d":
      return { period1: new Date(now - 7 * 86_400_000), interval: "1h" };
    case "30d":
      return { period1: new Date(now - 30 * 86_400_000), interval: "1d" };
    case "90d":
      return { period1: new Date(now - 90 * 86_400_000), interval: "1d" };
  }
}

export function createDefaultYahooAdapter(): YahooClientAdapter {
  const yf = new YahooFinance({
    suppressNotices: ["yahooSurvey", "ripHistorical"],
  });

  return {
    async quote(symbols: string[]) {
      const res = await yf.quote(symbols);
      return (Array.isArray(res) ? res : [res]) as YahooRawQuote[];
    },
    async chart(symbol: string, range: ChartRange) {
      const { period1, interval } = getChartParams(range);
      const res = await yf.chart(symbol, { period1, interval });
      return (res.quotes ?? []) as Array<{
        date: Date;
        open: number | null;
        high: number | null;
        low: number | null;
        close: number | null;
        volume?: number | null;
      }>;
    },
    async search(query: string) {
      const res = await yf.search(query, { quotesCount: 10, newsCount: 0 });
      return (res.quotes ?? []) as Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        exchange?: string;
        quoteType?: string;
      }>;
    },
  };
}

function toYahooIdxSymbol(symbol: string): string {
  const clean = symbol.trim().toUpperCase().replace(":IDX", "");
  return clean.endsWith(".JK") ? clean : `${clean}.JK`;
}

function stripIdxSuffix(symbol: string): string {
  return symbol.trim().toUpperCase().replace(".JK", "").replace(":IDX", "");
}

export class YahooFinanceIdxProvider implements StockMarketProvider {
  readonly name = "yahoo" as const;

  constructor(
    private readonly cache: CacheService,
    private readonly client: YahooClientAdapter = createDefaultYahooAdapter(),
  ) {}

  isConfigured(): boolean {
    return true;
  }

  supportsMarket(market: "IDX" | "US" | "GLOBAL"): boolean {
    return market === "IDX";
  }

  private mapQuote(raw: YahooRawQuote, fetchedAt: string, fromStaleCache = false): MarketTicker | null {
    if (!raw.symbol || raw.regularMarketPrice === undefined || raw.regularMarketPrice <= 0) {
      return null;
    }

    const isIdx = raw.symbol.toUpperCase().endsWith(".JK");
    const cleanSym = stripIdxSuffix(raw.symbol);
    const curated = POPULAR_IDX_STOCKS.find((s) => s.symbol === cleanSym);

    let sourceUpdatedAt: string | undefined;
    if (raw.regularMarketTime instanceof Date) {
      sourceUpdatedAt = raw.regularMarketTime.toISOString();
    } else if (typeof raw.regularMarketTime === "number" && raw.regularMarketTime > 0) {
      sourceUpdatedAt = new Date(raw.regularMarketTime * 1000).toISOString();
    }

    return {
      provider: "yahoo",
      assetClass: "stock",
      assetId: isIdx ? `${cleanSym}:IDX` : cleanSym,
      symbol: cleanSym,
      name: raw.shortName ?? raw.longName ?? curated?.name,
      exchange: isIdx ? "IDX" : (raw.exchange ?? "GLOBAL"),
      quoteCurrency: (raw.currency ?? (isIdx ? "IDR" : "USD")).toUpperCase(),
      price: toDecimalString(raw.regularMarketPrice),
      previousClose:
        raw.regularMarketPreviousClose !== undefined && raw.regularMarketPreviousClose > 0
          ? toDecimalString(raw.regularMarketPreviousClose)
          : undefined,
      change24h:
        raw.regularMarketChange !== undefined ? toDecimalString(raw.regularMarketChange) : undefined,
      change24hPercent:
        raw.regularMarketChangePercent !== undefined
          ? toDecimalString(raw.regularMarketChangePercent)
          : undefined,
      open:
        raw.regularMarketOpen !== undefined && raw.regularMarketOpen > 0
          ? toDecimalString(raw.regularMarketOpen)
          : undefined,
      high24h:
        raw.regularMarketDayHigh !== undefined && raw.regularMarketDayHigh > 0
          ? toDecimalString(raw.regularMarketDayHigh)
          : undefined,
      low24h:
        raw.regularMarketDayLow !== undefined && raw.regularMarketDayLow > 0
          ? toDecimalString(raw.regularMarketDayLow)
          : undefined,
      volume24h:
        raw.regularMarketVolume !== undefined && raw.regularMarketVolume >= 0
          ? toDecimalString(raw.regularMarketVolume)
          : undefined,
      isMarketOpen: raw.marketState === "REGULAR",
      dataFeedType: "delayed_or_eod",
      sourceLabel: isIdx
        ? "Sumber: Yahoo Finance (IDX) — delay ~15 menit"
        : "Sumber: Yahoo Finance — delayed",
      sourceUpdatedAt,
      fetchedAt,
      isStale: fromStaleCache,
      fromStaleCache,
    };
  }

  async getBatchIdxQuotes(symbols: string[]): Promise<Map<string, MarketTicker>> {
    const resultMap = new Map<string, MarketTicker>();
    if (symbols.length === 0) return resultMap;

    const cleanSymbols = Array.from(new Set(symbols.map(stripIdxSuffix).filter(Boolean)));
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
      for (const [sym, fb] of staleFallbacks) resultMap.set(sym, fb);
      if (resultMap.size > 0) return resultMap;
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    const started = Date.now();
    try {
      const yahooSymbols = missing.map(toYahooIdxSymbol);
      const rawQuotes = await this.client.quote(yahooSymbols);
      circuitBreaker.recordSuccess(this.name, Date.now() - started);

      const fetchedAt = nowIsoUtc();
      for (const raw of rawQuotes) {
        const mapped = this.mapQuote(raw, fetchedAt, false);
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
      circuitBreaker.recordFailure(this.name, "ERR");
      if (staleFallbacks.size > 0) {
        for (const [sym, fb] of staleFallbacks) resultMap.set(sym, fb);
        return resultMap;
      }
      throw new ProviderError(this.name, String(error), undefined, true);
    }
  }

  async getQuote(query: StockQuoteQuery): Promise<MarketTicker | null> {
    const cleanSym = stripIdxSuffix(query.symbol);
    const batch = await this.getBatchIdxQuotes([cleanSym]);
    return batch.get(cleanSym) ?? null;
  }

  async searchStocks(query: string, limit = 8): Promise<AssetSearchResult[]> {
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

    const started = Date.now();
    try {
      const raw = await this.client.search(clean);
      circuitBreaker.recordSuccess(this.name, Date.now() - started);

      const mapped: AssetSearchResult[] = raw
        .filter((item) => item.symbol && item.symbol.toUpperCase().endsWith(".JK"))
        .slice(0, Math.max(limit, 10))
        .map((item) => {
          const sym = stripIdxSuffix(item.symbol!);
          return {
            provider: "yahoo",
            assetClass: "stock",
            assetId: `${sym}:IDX`,
            symbol: sym,
            name: item.shortname ?? item.longname ?? sym,
            exchange: "IDX",
            market: "IDX",
            currency: "IDR",
          };
        });

      await this.cache.set(key, mapped, 3600, 14400);
      return mapped.slice(0, limit);
    } catch {
      circuitBreaker.recordFailure(this.name, "ERR");
      return cached ? cached.value.slice(0, limit) : [];
    }
  }

  async getHistoricalCandles(query: StockQuoteQuery, range: ChartRange): Promise<Candle[]> {
    const cleanSym = stripIdxSuffix(query.symbol);
    const yahooSym = toYahooIdxSymbol(cleanSym);
    const key = CacheKeys.stockSeries(this.name, cleanSym, range);
    const cached = await this.cache.get<Candle[]>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      return cached ? cached.value : [];
    }

    const started = Date.now();
    try {
      const rows = await this.client.chart(yahooSym, range);
      circuitBreaker.recordSuccess(this.name, Date.now() - started);

      const candles: Candle[] = rows
        .filter(
          (r) =>
            r.close !== null &&
            r.close !== undefined &&
            r.open !== null &&
            r.high !== null &&
            r.low !== null,
        )
        .map((r) => ({
          timestamp: r.date.toISOString(),
          open: toDecimalString(r.open!),
          high: toDecimalString(r.high!),
          low: toDecimalString(r.low!),
          close: toDecimalString(r.close!),
          volume: r.volume !== null && r.volume !== undefined ? toDecimalString(r.volume) : undefined,
        }));

      await this.cache.set(key, candles, 900, 7200);
      return candles;
    } catch {
      circuitBreaker.recordFailure(this.name, "ERR");
      return cached ? cached.value : [];
    }
  }

  getProviderStatus(): ProviderStatus {
    const snap = circuitBreaker.getSnapshot(this.name);
    return {
      provider: this.name,
      status: snap.state,
      configured: true,
      lastSuccessAt: snap.lastSuccessAt,
      lastErrorAt: snap.lastErrorAt,
      lastErrorCode: snap.lastErrorCode,
      latencyMs: snap.latencyMs,
      detail: "IDX (.JK) gratis, delay ~15m",
    };
  }
}
