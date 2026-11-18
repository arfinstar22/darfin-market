import type { Context } from "grammy";
import type { CacheService } from "../cache/redis.js";
import type { UserRepository } from "../db/repositories/user.repo.js";
import type { UserRow } from "../db/schema/index.js";
import type { AlertService } from "../services/alert.service.js";
import type { ChartService } from "../services/chart.service.js";
import type { FxService } from "../services/fx.service.js";
import type { MarketService } from "../services/market.service.js";
import type { ProviderHealthService } from "../services/provider-health.service.js";
import type { SearchService } from "../services/search.service.js";
import type { StockService } from "../services/stock.service.js";
import type { WatchlistService } from "../services/watchlist.service.js";

export interface AppServices {
  cache: CacheService;
  userRepo: UserRepository;
  marketService: MarketService;
  stockService: StockService;
  fxService: FxService;
  searchService: SearchService;
  watchlistService: WatchlistService;
  alertService: AlertService;
  chartService: ChartService;
  healthService: ProviderHealthService;
}

export interface BotContext extends Context {
  dbUser?: UserRow;
  services: AppServices;
}
