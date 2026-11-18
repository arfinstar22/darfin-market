import type { CacheService } from "../cache/redis.js";
import { env } from "../config/env.js";
import type { AlphaVantageProvider } from "../providers/alphavantage/provider.js";
import type { CoinPaprikaProvider } from "../providers/coinpaprika/provider.js";
import type { FinnhubProvider } from "../providers/finnhub/provider.js";
import type { FrankfurterProvider } from "../providers/frankfurter/provider.js";
import type { GoApiIdxProvider } from "../providers/goapi/provider.js";
import type { IndodaxProvider } from "../providers/indodax/provider.js";
import type { TwelveDataProvider } from "../providers/twelvedata/provider.js";
import type { YahooFinanceIdxProvider } from "../providers/yahoo/provider.js";
import type { ProviderStatus } from "../types/provider.js";
import { quotaTracker, type QuotaStatus } from "../utils/quota.js";

export interface SystemStatusSnapshot {
  botOk: boolean;
  dbOk: boolean;
  redisOk: boolean;
  cacheStats: { hits: number; misses: number; staleHits: number };
  providers: ProviderStatus[];
  quotas: QuotaStatus[];
}

export class ProviderHealthService {
  constructor(
    private readonly checkDb: () => Promise<boolean>,
    private readonly cache: CacheService,
    private readonly providers: {
      indodax: IndodaxProvider;
      coinpaprika: CoinPaprikaProvider;
      frankfurter: FrankfurterProvider;
      goapi: GoApiIdxProvider;
      yahoo: YahooFinanceIdxProvider;
      finnhub: FinnhubProvider;
      twelvedata: TwelveDataProvider;
      alphavantage: AlphaVantageProvider;
    },
  ) {}

  async getSystemStatus(): Promise<SystemStatusSnapshot> {
    const [dbOk, redisOk, cpQuota, goapiQuota, tdQuota, avQuota] = await Promise.all([
      this.checkDb(),
      this.cache.ping(),
      quotaTracker.getStatus("coinpaprika", "monthly", env.COINPAPRIKA_MONTHLY_QUOTA),
      quotaTracker.getStatus("goapi", "daily", env.GOAPI_DAILY_QUOTA),
      quotaTracker.getStatus("twelvedata", "daily", env.TWELVE_DATA_DAILY_QUOTA),
      quotaTracker.getStatus("alphavantage", "daily", env.ALPHA_VANTAGE_DAILY_QUOTA),
    ]);

    const quotas: QuotaStatus[] = [cpQuota];
    if (this.providers.goapi.isConfigured()) quotas.push(goapiQuota);
    if (this.providers.twelvedata.isConfigured()) quotas.push(tdQuota);
    if (this.providers.alphavantage.isConfigured()) quotas.push(avQuota);

    return {
      botOk: true,
      dbOk,
      redisOk,
      cacheStats: this.cache.stats(),
      providers: [
        this.providers.indodax.getProviderStatus(),
        this.providers.coinpaprika.getProviderStatus(),
        this.providers.frankfurter.getProviderStatus(),
        this.providers.goapi.getProviderStatus(),
        this.providers.yahoo.getProviderStatus(),
        this.providers.finnhub.getProviderStatus(),
        this.providers.twelvedata.getProviderStatus(),
        this.providers.alphavantage.getProviderStatus(),
      ],
      quotas,
    };
  }
}
