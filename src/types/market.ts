import type { ProviderName } from "./provider.js";

export type AssetClass = "crypto" | "stock" | "fx";

export type ChartRange = "1d" | "7d" | "30d" | "90d";

export interface MarketTicker {
  provider: ProviderName;
  assetClass: "crypto" | "stock";
  assetId: string;
  symbol: string;
  name?: string;
  exchange?: string;
  marketPair?: string;
  baseCurrency?: string;
  quoteCurrency: string;
  price: string; // Decimal string
  previousClose?: string;
  change24h?: string;
  change24hPercent?: string;
  high24h?: string;
  low24h?: string;
  open?: string;
  buy?: string;
  sell?: string;
  volume24h?: string;
  volumeQuote24h?: string;
  marketCap?: string;
  isMarketOpen?: boolean;
  dataFeedType: "exchange_ticker" | "global_aggregate" | "realtime_us" | "delayed_or_eod" | "eod";
  sourceLabel: string;
  sourceUpdatedAt?: string; // ISO UTC string from provider
  fetchedAt: string; // ISO UTC string from system
  isStale: boolean;
  fromStaleCache?: boolean;
}

export interface GlobalMarketStats {
  provider: "coinpaprika";
  marketCapUsd: string;
  volume24hUsd: string;
  btcDominancePercent: string;
  cryptocurrenciesNumber: number;
  marketCapChange24hPercent?: string;
  sourceUpdatedAt?: string;
  fetchedAt: string;
  isStale: boolean;
  fromStaleCache?: boolean;
}

export interface AssetSearchResult {
  provider: ProviderName;
  assetClass: "crypto" | "stock";
  assetId: string;
  symbol: string;
  name: string;
  exchange?: string;
  market?: "IDX" | "US" | "GLOBAL";
  currency?: string;
  rank?: number;
}

export interface Candle {
  timestamp: string; // ISO UTC
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

export interface ChartSeries {
  provider: ProviderName;
  assetId: string;
  symbol: string;
  quoteCurrency: string;
  range: ChartRange;
  points: Array<{ timestamp: string; price: string }>;
  sourceNote: string;
  startedAt: string;
  endedAt: string;
}

export interface FxRate {
  provider: "frankfurter";
  base: string;
  quote: string;
  rate: string; // Decimal string
  referenceDate: string; // YYYY-MM-DD
  fetchedAt: string;
  isStale: boolean;
  fromStaleCache?: boolean;
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol?: string;
  type?: string;
}

export interface IndodaxPair {
  id: string; // btcidr
  tickerId: string; // btc_idr
  symbol: string; // BTCIDR
  baseCurrency: string; // idr (quote in INDODAX naming)
  tradedCurrency: string; // btc
  tradedCurrencyUnit: string; // BTC
  description: string; // BTC/IDR
  isMaintenance: boolean;
  isSuspended: boolean;
}
