import type {
  AssetSearchResult,
  Candle,
  ChartRange,
  GlobalMarketStats,
  MarketTicker,
} from "../../types/market.js";
import type { ProviderName, ProviderStatus } from "../../types/provider.js";

export interface CryptoMarketProvider {
  readonly name: ProviderName;
  getTicker(assetIdOrSymbol: string, quote?: string): Promise<MarketTicker | null>;
  searchAssets(query: string, limit?: number): Promise<AssetSearchResult[]>;
  getGlobalStats?(): Promise<GlobalMarketStats>;
  getAllTickers?(): Promise<MarketTicker[]>;
  getHistoricalData?(assetId: string, range: ChartRange): Promise<Candle[]>;
  getProviderStatus(): ProviderStatus;
}
