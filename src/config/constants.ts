export const POPULAR_INDODAX_PAIRS = [
  "btcidr",
  "ethidr",
  "usdtidr",
  "solidr",
  "bnbidr",
  "xrpidr",
  "dogeidr",
  "adaidr",
] as const;

export const POPULAR_CRYPTO_SYMBOLS = [
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "USDT",
  "DOGE",
  "ADA",
] as const;

export interface CuratedStock {
  symbol: string;
  name: string;
  market: "IDX" | "US";
  exchange: string;
  currency: "IDR" | "USD";
}

export const POPULAR_IDX_STOCKS: readonly CuratedStock[] = [
  { symbol: "BBCA", name: "Bank Central Asia Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
  { symbol: "BBRI", name: "Bank Rakyat Indonesia Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
  { symbol: "BMRI", name: "Bank Mandiri Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
  { symbol: "BBNI", name: "Bank Negara Indonesia Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
  { symbol: "TLKM", name: "Telkom Indonesia Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
  { symbol: "ASII", name: "Astra International Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
  { symbol: "UNVR", name: "Unilever Indonesia Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
  { symbol: "ICBP", name: "Indofood CBP Sukses Makmur Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
  { symbol: "GOTO", name: "GoTo Gojek Tokopedia Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
  { symbol: "ANTM", name: "Aneka Tambang Tbk", market: "IDX", exchange: "IDX", currency: "IDR" },
] as const;

export const POPULAR_US_STOCKS: readonly CuratedStock[] = [
  { symbol: "AAPL", name: "Apple Inc.", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "MSFT", name: "Microsoft Corp.", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "NVDA", name: "NVIDIA Corp.", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "GOOGL", name: "Alphabet Inc.", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "AMZN", name: "Amazon.com Inc.", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "META", name: "Meta Platforms Inc.", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "TSLA", name: "Tesla Inc.", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "NFLX", name: "Netflix Inc.", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "AMD", name: "Advanced Micro Devices", market: "US", exchange: "NASDAQ", currency: "USD" },
  { symbol: "TSM", name: "TSMC (ADR)", market: "US", exchange: "NYSE", currency: "USD" },
] as const;

export const POPULAR_IDX_SYMBOL_SET = new Set(POPULAR_IDX_STOCKS.map((s) => s.symbol));
export const POPULAR_US_SYMBOL_SET = new Set(POPULAR_US_STOCKS.map((s) => s.symbol));

export const STALE_THRESHOLD_SECONDS = {
  indodax: 300, // 5 minutes
  coinpaprika: 1800, // 30 minutes (free tier updates up to ~10m)
  frankfurter: 172800, // 48 hours (weekends/holidays reference rates)
  finnhub: 300, // 5 minutes during market hours (last trade timestamp handled separately when market closed)
  twelvedata: 900, // 15 minutes
  alphavantage: 172800, // EOD data
} as const;

export const SUPPORTED_TIMEZONES = [
  "Asia/Makassar",
  "Asia/Jakarta",
  "Asia/Jayapura",
  "Asia/Singapore",
  "UTC",
] as const;

export const POPULAR_FX_QUOTES = [
  "IDR",
  "USD",
  "EUR",
  "SGD",
  "JPY",
  "GBP",
  "AUD",
  "MYR",
  "CNY",
  "KRW",
  "SAR",
] as const;
