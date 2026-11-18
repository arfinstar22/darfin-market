import type { AssetSearchResult, Candle, ChartRange, MarketTicker } from "../../types/market.js";
import type { ProviderName, ProviderStatus } from "../../types/provider.js";

export interface StockQuoteQuery {
  symbol: string;
  exchange?: string;
}

export interface StockMarketProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  supportsMarket(market: "IDX" | "US" | "GLOBAL"): boolean;
  getQuote(query: StockQuoteQuery): Promise<MarketTicker | null>;
  searchStocks(query: string, limit?: number): Promise<AssetSearchResult[]>;
  getHistoricalCandles?(query: StockQuoteQuery, range: ChartRange): Promise<Candle[]>;
  getProviderStatus(): ProviderStatus;
}
