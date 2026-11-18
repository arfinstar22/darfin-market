import type { Redis } from "ioredis";
import type { Pool } from "pg";
import type { AppServices } from "./bot/context.js";
import {
  createRedisClient,
  createRedisQuotaStore,
  MemoryCacheService,
  RedisCacheService,
  type CacheService,
} from "./cache/redis.js";
import { env } from "./config/env.js";
import { checkDbHealth, createDb, createDbPool, type AppDb } from "./db/client.js";
import { AlertRepository } from "./db/repositories/alert.repo.js";
import { ProviderHealthRepository } from "./db/repositories/provider-health.repo.js";
import { SnapshotRepository } from "./db/repositories/snapshot.repo.js";
import { UserRepository } from "./db/repositories/user.repo.js";
import { WatchlistRepository } from "./db/repositories/watchlist.repo.js";
import { AlphaVantageProvider } from "./providers/alphavantage/provider.js";
import { CoinPaprikaProvider } from "./providers/coinpaprika/provider.js";
import { FinnhubProvider } from "./providers/finnhub/provider.js";
import { FrankfurterProvider } from "./providers/frankfurter/provider.js";
import { GoApiIdxProvider } from "./providers/goapi/provider.js";
import { IndodaxProvider } from "./providers/indodax/provider.js";
import { TwelveDataProvider } from "./providers/twelvedata/provider.js";
import { AlertService } from "./services/alert.service.js";
import { ChartService } from "./services/chart.service.js";
import { FxService } from "./services/fx.service.js";
import { MarketService } from "./services/market.service.js";
import { ProviderHealthService } from "./services/provider-health.service.js";
import { SearchService } from "./services/search.service.js";
import { StockService } from "./services/stock.service.js";
import { WatchlistService } from "./services/watchlist.service.js";
import { logger } from "./utils/logger.js";
import { quotaTracker } from "./utils/quota.js";

export interface AppContainer {
  pool: Pool;
  db: AppDb;
  redis: Redis | null;
  cache: CacheService;
  repos: {
    users: UserRepository;
    watchlist: WatchlistRepository;
    alerts: AlertRepository;
    snapshots: SnapshotRepository;
    providerHealth: ProviderHealthRepository;
  };
  providers: {
    indodax: IndodaxProvider;
    coinpaprika: CoinPaprikaProvider;
    frankfurter: FrankfurterProvider;
    goapi: GoApiIdxProvider;
    finnhub: FinnhubProvider;
    twelvedata: TwelveDataProvider;
    alphavantage: AlphaVantageProvider;
  };
  services: AppServices;
  close(): Promise<void>;
}

export function createAppContainer(): AppContainer {
  const pool = createDbPool();
  const db = createDb(pool);

  let redis: Redis | null = null;
  let cache: CacheService;
  if (env.REDIS_URL) {
    redis = createRedisClient(env.REDIS_URL);
    cache = new RedisCacheService(redis);
    quotaTracker.setStore(createRedisQuotaStore(redis));
  } else {
    cache = new MemoryCacheService();
    logger.info("REDIS_URL not set; using in-memory cache and quota store");
  }

  const users = new UserRepository(db);
  const watchlist = new WatchlistRepository(db);
  const alerts = new AlertRepository(db);
  const snapshots = new SnapshotRepository(db);
  const providerHealth = new ProviderHealthRepository(db);

  const indodax = new IndodaxProvider(cache);
  const coinpaprika = new CoinPaprikaProvider(cache);
  const frankfurter = new FrankfurterProvider(cache);
  const goapi = new GoApiIdxProvider(cache);
  const finnhub = new FinnhubProvider(cache);
  const twelvedata = new TwelveDataProvider(cache);
  const alphavantage = new AlphaVantageProvider(cache);

  const marketService = new MarketService(indodax, coinpaprika, frankfurter);
  const stockService = new StockService(finnhub, twelvedata, alphavantage, goapi);
  const fxService = new FxService(frankfurter);
  const searchService = new SearchService(coinpaprika, stockService);
  const watchlistService = new WatchlistService(
    watchlist,
    indodax,
    coinpaprika,
    marketService,
    stockService,
  );
  const alertService = new AlertService(alerts, marketService, stockService);
  const chartService = new ChartService(snapshots, indodax, coinpaprika, twelvedata, goapi);
  const healthService = new ProviderHealthService(() => checkDbHealth(pool), cache, {
    indodax,
    coinpaprika,
    frankfurter,
    goapi,
    finnhub,
    twelvedata,
    alphavantage,
  });

  return {
    pool,
    db,
    redis,
    cache,
    repos: { users, watchlist, alerts, snapshots, providerHealth },
    providers: { indodax, coinpaprika, frankfurter, goapi, finnhub, twelvedata, alphavantage },
    services: {
      cache,
      userRepo: users,
      marketService,
      stockService,
      fxService,
      searchService,
      watchlistService,
      alertService,
      chartService,
      healthService,
    },
    async close() {
      const tasks: Promise<unknown>[] = [pool.end()];
      if (redis) tasks.push(redis.quit());
      await Promise.allSettled(tasks);
    },
  };
}
