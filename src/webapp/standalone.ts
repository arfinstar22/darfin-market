import { MemoryCacheService } from "../cache/redis.js";
import { env, getEffectiveWebAppPort } from "../config/env.js";
import { AlphaVantageProvider } from "../providers/alphavantage/provider.js";
import { CoinPaprikaProvider } from "../providers/coinpaprika/provider.js";
import { FinnhubProvider } from "../providers/finnhub/provider.js";
import { FrankfurterProvider } from "../providers/frankfurter/provider.js";
import { GoApiIdxProvider } from "../providers/goapi/provider.js";
import { IndodaxProvider } from "../providers/indodax/provider.js";
import { TwelveDataProvider } from "../providers/twelvedata/provider.js";
import { AlertService } from "../services/alert.service.js";
import { ChartService } from "../services/chart.service.js";
import { FxService } from "../services/fx.service.js";
import { MarketService } from "../services/market.service.js";
import { ProviderHealthService } from "../services/provider-health.service.js";
import { SearchService } from "../services/search.service.js";
import { StockService } from "../services/stock.service.js";
import { WatchlistService } from "../services/watchlist.service.js";
import type { AlertRepository } from "../db/repositories/alert.repo.js";
import type { SnapshotRepository } from "../db/repositories/snapshot.repo.js";
import type { UserRepository } from "../db/repositories/user.repo.js";
import type { WatchlistRepository } from "../db/repositories/watchlist.repo.js";
import { logger } from "../utils/logger.js";
import { startWebAppServer } from "./server.js";

/**
 * Standalone Mini App preview server (no PostgreSQL/Redis required for local UI preview).
 * In production, src/app.ts starts the WebApp server backed by full PostgreSQL + Redis.
 */
async function main() {
  const cache = new MemoryCacheService();
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

  const emptySnapshots = {
    getSeries: async () => [],
  } as unknown as SnapshotRepository;

  const chartService = new ChartService(emptySnapshots, indodax, coinpaprika, twelvedata, goapi);
  const healthService = new ProviderHealthService(async () => false, cache, {
    indodax,
    coinpaprika,
    frankfurter,
    goapi,
    finnhub,
    twelvedata,
    alphavantage,
  });

  const server = await startWebAppServer({
    services: {
      cache,
      userRepo: {} as UserRepository,
      marketService,
      stockService,
      fxService,
      searchService,
      watchlistService: new WatchlistService(
        {} as WatchlistRepository,
        indodax,
        coinpaprika,
        marketService,
        stockService,
      ),
      alertService: new AlertService({} as AlertRepository, marketService, stockService),
      chartService,
      healthService,
    },
    host: env.WEBAPP_HOST,
    port: getEffectiveWebAppPort(),
  });

  const shutdown = () => {
    logger.info("Stopping standalone Mini App server");
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.fatal({ err: String(err) }, "Standalone WebApp error");
  process.exit(1);
});
