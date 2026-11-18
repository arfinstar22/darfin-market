import { CacheKeys } from "../../cache/cache-keys.js";
import type { CacheService } from "../../cache/redis.js";
import { STALE_THRESHOLD_SECONDS } from "../../config/constants.js";
import { env } from "../../config/env.js";
import type {
  AssetSearchResult,
  Candle,
  ChartRange,
  GlobalMarketStats,
  MarketTicker,
} from "../../types/market.js";
import type { ProviderStatus } from "../../types/provider.js";
import { circuitBreaker } from "../../utils/circuit-breaker.js";
import { isTimestampStale, nowIsoUtc, unixSecondsToIsoUtc } from "../../utils/dates.js";
import { toDecimalString } from "../../utils/decimal.js";
import { ProviderError } from "../../utils/errors.js";
import { quotaTracker } from "../../utils/quota.js";
import type { CryptoMarketProvider } from "../interfaces/crypto-provider.js";
import { CoinPaprikaClient } from "./client.js";
import type { CoinPaprikaTickerRaw } from "./schemas.js";

export class CoinPaprikaProvider implements CryptoMarketProvider {
  readonly name = "coinpaprika" as const;

  constructor(
    private readonly cache: CacheService,
    private readonly client: CoinPaprikaClient = new CoinPaprikaClient(),
  ) {}

  private mapTicker(raw: CoinPaprikaTickerRaw, fetchedAt: string, fromStaleCache: boolean): MarketTicker {
    const usd = raw.quotes.USD;
    const sourceUpdatedAt = raw.last_updated;
    const isStale =
      fromStaleCache || isTimestampStale(sourceUpdatedAt, STALE_THRESHOLD_SECONDS.coinpaprika);

    return {
      provider: "coinpaprika",
      assetClass: "crypto",
      assetId: raw.id,
      symbol: raw.symbol.toUpperCase(),
      name: raw.name,
      quoteCurrency: "USD",
      price: toDecimalString(usd.price),
      change24hPercent:
        usd.percent_change_24h !== null && usd.percent_change_24h !== undefined
          ? toDecimalString(usd.percent_change_24h)
          : undefined,
      volume24h:
        usd.volume_24h !== null && usd.volume_24h !== undefined
          ? toDecimalString(usd.volume_24h)
          : undefined,
      marketCap:
        usd.market_cap !== null && usd.market_cap !== undefined
          ? toDecimalString(usd.market_cap)
          : undefined,
      dataFeedType: "global_aggregate",
      sourceLabel: "Sumber: CoinPaprika",
      sourceUpdatedAt,
      fetchedAt,
      isStale,
      fromStaleCache,
    };
  }

  async getGlobalStats(): Promise<GlobalMarketStats> {
    const key = CacheKeys.coinpaprikaGlobal();
    const cached = await this.cache.get<GlobalMarketStats>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) return { ...cached.value, isStale: true, fromStaleCache: true };
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      await quotaTracker.consume(this.name, "monthly", env.COINPAPRIKA_MONTHLY_QUOTA, {
        isEssential: true,
      });
      const { global, latencyMs } = await this.client.getGlobal();
      const sourceUpdatedAt = unixSecondsToIsoUtc(global.last_updated);
      const stats: GlobalMarketStats = {
        provider: "coinpaprika",
        marketCapUsd: toDecimalString(global.market_cap_usd),
        volume24hUsd: toDecimalString(global.volume_24h_usd),
        btcDominancePercent: toDecimalString(global.bitcoin_dominance_percentage),
        cryptocurrenciesNumber: global.cryptocurrencies_number,
        marketCapChange24hPercent:
          global.market_cap_change_24h !== undefined
            ? toDecimalString(global.market_cap_change_24h)
            : undefined,
        sourceUpdatedAt,
        fetchedAt: nowIsoUtc(),
        isStale: isTimestampStale(sourceUpdatedAt, STALE_THRESHOLD_SECONDS.coinpaprika),
      };
      circuitBreaker.recordSuccess(this.name, latencyMs);
      await this.cache.set(key, stats, env.COINPAPRIKA_TICKER_TTL, 7200);
      return stats;
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      if (cached) return { ...cached.value, isStale: true, fromStaleCache: true };
      throw error;
    }
  }

  async getAllTickers(): Promise<MarketTicker[]> {
    const key = CacheKeys.coinpaprikaTickers();
    const cached = await this.cache.get<MarketTicker[]>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) {
        return cached.value.map((t) => ({ ...t, isStale: true, fromStaleCache: true }));
      }
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      await quotaTracker.consume(this.name, "monthly", env.COINPAPRIKA_MONTHLY_QUOTA, {
        isEssential: false,
      });
      const { tickers, latencyMs } = await this.client.getTickers();
      const fetchedAt = nowIsoUtc();
      const mapped = tickers.map((raw) => this.mapTicker(raw, fetchedAt, false));
      circuitBreaker.recordSuccess(this.name, latencyMs);
      await this.cache.set(key, mapped, env.COINPAPRIKA_TICKER_TTL, 7200);
      return mapped;
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      if (cached) {
        return cached.value.map((t) => ({ ...t, isStale: true, fromStaleCache: true }));
      }
      throw error;
    }
  }

  async getTickerByCoinId(coinId: string): Promise<MarketTicker | null> {
    const cleanId = coinId.trim().toLowerCase();
    const key = CacheKeys.coinpaprikaTicker(cleanId);
    const cached = await this.cache.get<MarketTicker>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    // Check if already in cached full tickers list to save API quota
    const allCached = await this.cache.get<MarketTicker[]>(CacheKeys.coinpaprikaTickers());
    if (allCached && !allCached.isStale) {
      const fromBulk = allCached.value.find((t) => t.assetId === cleanId);
      if (fromBulk) return fromBulk;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) return { ...cached.value, isStale: true, fromStaleCache: true };
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      await quotaTracker.consume(this.name, "monthly", env.COINPAPRIKA_MONTHLY_QUOTA, {
        isEssential: true,
      });
      const { ticker, latencyMs } = await this.client.getTicker(cleanId);
      const mapped = this.mapTicker(ticker, nowIsoUtc(), false);
      circuitBreaker.recordSuccess(this.name, latencyMs);
      await this.cache.set(key, mapped, env.COINPAPRIKA_TICKER_TTL, 7200);
      return mapped;
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

  async resolveSymbolCandidates(symbolOrId: string): Promise<AssetSearchResult[]> {
    const cleaned = symbolOrId.trim();
    if (!cleaned) return [];

    // Direct coin_id format (e.g. btc-bitcoin)
    if (cleaned.includes("-")) {
      const ticker = await this.getTickerByCoinId(cleaned);
      if (ticker) {
        return [
          {
            provider: "coinpaprika",
            assetClass: "crypto",
            assetId: ticker.assetId,
            symbol: ticker.symbol,
            name: ticker.name ?? ticker.symbol,
            currency: "USD",
          },
        ];
      }
    }

    const searchResults = await this.searchAssets(cleaned, 10);
    const upper = cleaned.toUpperCase();
    const exactMatches = searchResults.filter((r) => r.symbol.toUpperCase() === upper);
    return exactMatches.length > 0 ? exactMatches : searchResults;
  }

  async getTicker(assetIdOrSymbol: string): Promise<MarketTicker | null> {
    if (assetIdOrSymbol.includes("-")) {
      return this.getTickerByCoinId(assetIdOrSymbol);
    }
    const candidates = await this.resolveSymbolCandidates(assetIdOrSymbol);
    if (candidates.length === 0) return null;
    // Prefer top-ranked exact match when single unambiguous caller requests direct ticker
    const best = candidates[0];
    if (!best) return null;
    return this.getTickerByCoinId(best.assetId);
  }

  async searchAssets(query: string, limit = 8): Promise<AssetSearchResult[]> {
    const clean = query.trim();
    if (!clean) return [];
    const key = CacheKeys.coinpaprikaSearch(clean);
    const cached = await this.cache.get<AssetSearchResult[]>(key);
    if (cached && !cached.isStale) {
      return cached.value.slice(0, limit);
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) return cached.value.slice(0, limit);
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      await quotaTracker.consume(this.name, "monthly", env.COINPAPRIKA_MONTHLY_QUOTA, {
        isEssential: true,
      });
      const { results, latencyMs } = await this.client.search(clean, Math.max(limit, 10));
      const mapped: AssetSearchResult[] = results
        .filter((r) => r.is_active !== false)
        .sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999))
        .map((r) => ({
          provider: "coinpaprika",
          assetClass: "crypto",
          assetId: r.id,
          symbol: r.symbol.toUpperCase(),
          name: r.name,
          currency: "USD",
          rank: r.rank ?? undefined,
        }));
      circuitBreaker.recordSuccess(this.name, latencyMs);
      await this.cache.set(key, mapped, 3600, 14400);
      return mapped.slice(0, limit);
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      if (cached) return cached.value.slice(0, limit);
      throw error;
    }
  }

  async getHistoricalData(assetId: string, range: ChartRange): Promise<Candle[]> {
    // CoinPaprika free tier restricts OHLCV history to the latest 24h window.
    if (range !== "1d") {
      return [];
    }

    const key = CacheKeys.coinpaprikaOhlcvLatest(assetId);
    const cached = await this.cache.get<Candle[]>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      return cached ? cached.value : [];
    }

    try {
      await quotaTracker.consume(this.name, "monthly", env.COINPAPRIKA_MONTHLY_QUOTA, {
        isEssential: false,
      });
      const { candles, latencyMs } = await this.client.getOhlcvLatest(assetId);
      const mapped: Candle[] = candles.map((c) => ({
        timestamp: c.time_close,
        open: toDecimalString(c.open),
        high: toDecimalString(c.high),
        low: toDecimalString(c.low),
        close: toDecimalString(c.close),
        volume: c.volume !== undefined ? toDecimalString(c.volume) : undefined,
      }));
      circuitBreaker.recordSuccess(this.name, latencyMs);
      await this.cache.set(key, mapped, 1800, 7200);
      return mapped;
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
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
    };
  }
}
