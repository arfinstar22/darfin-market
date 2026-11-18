import { CacheKeys } from "../../cache/cache-keys.js";
import type { CacheService } from "../../cache/redis.js";
import { STALE_THRESHOLD_SECONDS } from "../../config/constants.js";
import { env } from "../../config/env.js";
import type { AssetSearchResult, IndodaxPair, MarketTicker } from "../../types/market.js";
import type { ProviderStatus } from "../../types/provider.js";
import { circuitBreaker } from "../../utils/circuit-breaker.js";
import { isTimestampStale, nowIsoUtc, unixSecondsToIsoUtc } from "../../utils/dates.js";
import { calculatePercentChange, toDecimalString } from "../../utils/decimal.js";
import { ProviderError } from "../../utils/errors.js";
import type { CryptoMarketProvider } from "../interfaces/crypto-provider.js";
import { IndodaxClient } from "./client.js";
import type { IndodaxTickerEntry } from "./schemas.js";

interface CachedSummaries {
  tickers: Record<string, IndodaxTickerEntry>;
  prices24h: Record<string, string>;
  fetchedAt: string;
}

export class IndodaxProvider implements CryptoMarketProvider {
  readonly name = "indodax" as const;

  constructor(
    private readonly cache: CacheService,
    private readonly client: IndodaxClient = new IndodaxClient(),
  ) {}

  async getPairs(): Promise<IndodaxPair[]> {
    const key = CacheKeys.indodaxPairs();
    const cached = await this.cache.get<IndodaxPair[]>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) return cached.value;
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      const { pairs, latencyMs } = await this.client.getPairs();
      const mapped: IndodaxPair[] = pairs.map((p) => ({
        id: p.id.toLowerCase(),
        tickerId: p.ticker_id.toLowerCase(),
        symbol: p.symbol.toUpperCase(),
        baseCurrency: p.base_currency.toLowerCase(),
        tradedCurrency: p.traded_currency.toLowerCase(),
        tradedCurrencyUnit: p.traded_currency_unit.toUpperCase(),
        description: p.description,
        isMaintenance: Boolean(p.is_maintenance),
        isSuspended: Boolean(p.is_market_suspended),
      }));
      circuitBreaker.recordSuccess(this.name, latencyMs);
      await this.cache.set(key, mapped, env.INDODAX_PAIRS_TTL, env.INDODAX_PAIRS_TTL * 4);
      return mapped;
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      if (cached) return cached.value;
      throw error;
    }
  }

  async resolvePair(symbolOrPair: string, quote = "IDR"): Promise<IndodaxPair | null> {
    const pairs = await this.getPairs();
    const normalized = symbolOrPair.trim().toLowerCase().replace(/[/_-\s]/g, "");
    const normalizedQuote = quote.trim().toLowerCase();

    const exact = pairs.find(
      (p) =>
        (p.id === normalized || p.symbol.toLowerCase() === normalized) &&
        !p.isSuspended &&
        !p.isMaintenance,
    );
    if (exact) return exact;

    const byBaseAndQuote = pairs.find(
      (p) =>
        p.tradedCurrency === normalized &&
        p.baseCurrency === normalizedQuote &&
        !p.isSuspended &&
        !p.isMaintenance,
    );
    return byBaseAndQuote ?? null;
  }

  private async getSummariesCached(): Promise<{ data: CachedSummaries; fromStaleCache: boolean }> {
    const key = CacheKeys.indodaxSummaries();
    const cached = await this.cache.get<CachedSummaries>(key);
    if (cached && !cached.isStale) {
      return { data: cached.value, fromStaleCache: false };
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) return { data: cached.value, fromStaleCache: true };
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      const { summaries, latencyMs } = await this.client.getSummaries();
      const payload: CachedSummaries = {
        tickers: summaries.tickers,
        prices24h: summaries.prices_24h ?? {},
        fetchedAt: nowIsoUtc(),
      };
      circuitBreaker.recordSuccess(this.name, latencyMs);
      await this.cache.set(key, payload, env.INDODAX_TICKER_TTL, 3600);
      return { data: payload, fromStaleCache: false };
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      if (cached) {
        return { data: cached.value, fromStaleCache: true };
      }
      throw error;
    }
  }

  private mapTicker(
    pair: IndodaxPair,
    raw: IndodaxTickerEntry,
    price24hAgo: string | undefined,
    fetchedAt: string,
    fromStaleCache: boolean,
  ): MarketTicker {
    const sourceUpdatedAt = unixSecondsToIsoUtc(raw.server_time);
    const isStale =
      fromStaleCache || isTimestampStale(sourceUpdatedAt, STALE_THRESHOLD_SECONDS.indodax);

    const volBaseKey = `vol_${pair.tradedCurrency}`;
    const volQuoteKey = `vol_${pair.baseCurrency}`;
    const rawVolBase = raw[volBaseKey];
    const rawVolQuote = raw[volQuoteKey];

    const lastPrice = toDecimalString(raw.last);
    const change24hPercent =
      price24hAgo !== undefined ? calculatePercentChange(lastPrice, price24hAgo) : undefined;

    return {
      provider: "indodax",
      assetClass: "crypto",
      assetId: pair.id,
      symbol: pair.tradedCurrencyUnit,
      name: raw.name ?? pair.description,
      exchange: "INDODAX",
      marketPair: pair.id,
      baseCurrency: pair.tradedCurrencyUnit,
      quoteCurrency: pair.baseCurrency.toUpperCase(),
      price: lastPrice,
      change24hPercent,
      high24h: toDecimalString(raw.high),
      low24h: toDecimalString(raw.low),
      buy: toDecimalString(raw.buy),
      sell: toDecimalString(raw.sell),
      volume24h:
        typeof rawVolBase === "string" || typeof rawVolBase === "number"
          ? toDecimalString(rawVolBase)
          : undefined,
      volumeQuote24h:
        typeof rawVolQuote === "string" || typeof rawVolQuote === "number"
          ? toDecimalString(rawVolQuote)
          : undefined,
      dataFeedType: "exchange_ticker",
      sourceLabel: "Sumber: INDODAX",
      sourceUpdatedAt,
      fetchedAt,
      isStale,
      fromStaleCache,
    };
  }

  async getTicker(assetIdOrSymbol: string, quote = "IDR"): Promise<MarketTicker | null> {
    const pair = await this.resolvePair(assetIdOrSymbol, quote);
    if (!pair) {
      return null;
    }

    const { data, fromStaleCache } = await this.getSummariesCached();
    const raw = data.tickers[pair.tickerId];
    if (!raw) {
      return null;
    }

    const price24h = data.prices24h[pair.id] ?? data.prices24h[pair.tickerId];
    return this.mapTicker(pair, raw, price24h, data.fetchedAt, fromStaleCache);
  }

  async getAllTickers(): Promise<MarketTicker[]> {
    const [pairs, summariesResult] = await Promise.all([
      this.getPairs(),
      this.getSummariesCached(),
    ]);
    const { data, fromStaleCache } = summariesResult;
    const results: MarketTicker[] = [];

    for (const pair of pairs) {
      if (pair.isMaintenance || pair.isSuspended) continue;
      const raw = data.tickers[pair.tickerId];
      if (!raw) continue;
      const price24h = data.prices24h[pair.id] ?? data.prices24h[pair.tickerId];
      results.push(this.mapTicker(pair, raw, price24h, data.fetchedAt, fromStaleCache));
    }

    return results;
  }

  async searchAssets(query: string, limit = 8): Promise<AssetSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const pairs = await this.getPairs();
    return pairs
      .filter(
        (p) =>
          !p.isSuspended &&
          !p.isMaintenance &&
          (p.tradedCurrency.includes(q) ||
            p.symbol.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)),
      )
      .slice(0, limit)
      .map((p) => ({
        provider: "indodax" as const,
        assetClass: "crypto" as const,
        assetId: p.id,
        symbol: p.tradedCurrencyUnit,
        name: p.description,
        exchange: "INDODAX",
        currency: p.baseCurrency.toUpperCase(),
      }));
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
