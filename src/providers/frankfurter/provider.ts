import { CacheKeys } from "../../cache/cache-keys.js";
import type { CacheService } from "../../cache/redis.js";
import { env } from "../../config/env.js";
import type { CurrencyInfo, FxRate } from "../../types/market.js";
import type { ProviderStatus } from "../../types/provider.js";
import { circuitBreaker } from "../../utils/circuit-breaker.js";
import { nowIsoUtc } from "../../utils/dates.js";
import { toDecimalString } from "../../utils/decimal.js";
import { ProviderError } from "../../utils/errors.js";
import type { FxProvider } from "../interfaces/fx-provider.js";
import { FrankfurterClient } from "./client.js";

export class FrankfurterProvider implements FxProvider {
  readonly name = "frankfurter" as const;

  constructor(
    private readonly cache: CacheService,
    private readonly client: FrankfurterClient = new FrankfurterClient(),
  ) {}

  async getCurrencies(): Promise<CurrencyInfo[]> {
    const key = CacheKeys.frankfurterCurrencies();
    const cached = await this.cache.get<CurrencyInfo[]>(key);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) return cached.value;
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      const { currencies, latencyMs } = await this.client.getCurrencies();
      const mapped: CurrencyInfo[] = currencies.map((c) => ({
        code: c.iso_code.toUpperCase(),
        name: c.name,
        symbol: c.symbol ?? undefined,
        type: c.type,
      }));
      circuitBreaker.recordSuccess(this.name, latencyMs);
      await this.cache.set(key, mapped, 86_400, 86_400 * 7);
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

  async hasCurrency(code: string): Promise<boolean> {
    const currencies = await this.getCurrencies();
    const target = code.trim().toUpperCase();
    return currencies.some((c) => c.code === target);
  }

  async getRates(base: string, quotes?: string[]): Promise<FxRate[]> {
    const normalizedBase = base.trim().toUpperCase();
    const filteredQuotes = quotes
      ?.map((q) => q.trim().toUpperCase())
      .filter((q) => q !== normalizedBase);

    const key = CacheKeys.frankfurterRatesBase(normalizedBase);
    const cached = await this.cache.get<FxRate[]>(key);

    if (cached && !cached.isStale) {
      return filteredQuotes && filteredQuotes.length > 0
        ? cached.value.filter((r) => filteredQuotes.includes(r.quote))
        : cached.value;
    }

    if (!circuitBreaker.canExecute(this.name)) {
      if (cached) {
        const stale = cached.value.map((r) => ({ ...r, isStale: true, fromStaleCache: true }));
        return filteredQuotes && filteredQuotes.length > 0
          ? stale.filter((r) => filteredQuotes.includes(r.quote))
          : stale;
      }
      throw new ProviderError(this.name, "Circuit breaker open");
    }

    try {
      const { rates, latencyMs } = await this.client.getRates(normalizedBase);
      const fetchedAt = nowIsoUtc();
      const mapped: FxRate[] = rates.map((r) => ({
        provider: "frankfurter",
        base: r.base.toUpperCase(),
        quote: r.quote.toUpperCase(),
        rate: toDecimalString(r.rate),
        referenceDate: r.date,
        fetchedAt,
        isStale: false,
      }));
      circuitBreaker.recordSuccess(this.name, latencyMs);
      await this.cache.set(key, mapped, env.FRANKFURTER_RATE_TTL, 86_400 * 3);
      return filteredQuotes && filteredQuotes.length > 0
        ? mapped.filter((r) => filteredQuotes.includes(r.quote))
        : mapped;
    } catch (error) {
      circuitBreaker.recordFailure(
        this.name,
        error instanceof ProviderError ? String(error.statusCode ?? error.code) : "ERR",
      );
      if (cached) {
        const stale = cached.value.map((r) => ({ ...r, isStale: true, fromStaleCache: true }));
        return filteredQuotes && filteredQuotes.length > 0
          ? stale.filter((r) => filteredQuotes.includes(r.quote))
          : stale;
      }
      throw error;
    }
  }

  async getRate(base: string, quote: string): Promise<FxRate | null> {
    const normalizedBase = base.trim().toUpperCase();
    const normalizedQuote = quote.trim().toUpperCase();

    if (normalizedBase === normalizedQuote) {
      const has = await this.hasCurrency(normalizedBase);
      if (!has) return null;
      return {
        provider: "frankfurter",
        base: normalizedBase,
        quote: normalizedQuote,
        rate: "1",
        referenceDate: new Date().toISOString().slice(0, 10),
        fetchedAt: nowIsoUtc(),
        isStale: false,
      };
    }

    const rates = await this.getRates(normalizedBase, [normalizedQuote]);
    return rates[0] ?? null;
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
