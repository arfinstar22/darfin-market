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
  sector: string;
}

export const POPULAR_IDX_STOCKS: readonly CuratedStock[] = [
  { symbol: "BBCA", name: "Bank Central Asia Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Perbankan" },
  { symbol: "BBRI", name: "Bank Rakyat Indonesia Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Perbankan" },
  { symbol: "BMRI", name: "Bank Mandiri Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Perbankan" },
  { symbol: "BBNI", name: "Bank Negara Indonesia Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Perbankan" },
  { symbol: "TLKM", name: "Telkom Indonesia Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Telko & Digital" },
  { symbol: "GOTO", name: "GoTo Gojek Tokopedia Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Telko & Digital" },
  { symbol: "ASII", name: "Astra International Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Industri & Tambang" },
  { symbol: "ANTM", name: "Aneka Tambang Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Industri & Tambang" },
  { symbol: "UNVR", name: "Unilever Indonesia Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Konsumer" },
  { symbol: "ICBP", name: "Indofood CBP Sukses Makmur Tbk", market: "IDX", exchange: "IDX", currency: "IDR", sector: "Konsumer" },
] as const;

export const POPULAR_US_STOCKS: readonly CuratedStock[] = [
  { symbol: "NVDA", name: "NVIDIA Corp.", market: "US", exchange: "NASDAQ", currency: "USD", sector: "AI & Chip" },
  { symbol: "AMD", name: "Advanced Micro Devices", market: "US", exchange: "NASDAQ", currency: "USD", sector: "AI & Chip" },
  { symbol: "TSM", name: "TSMC (ADR)", market: "US", exchange: "NYSE", currency: "USD", sector: "AI & Chip" },
  { symbol: "AAPL", name: "Apple Inc.", market: "US", exchange: "NASDAQ", currency: "USD", sector: "Big Tech" },
  { symbol: "MSFT", name: "Microsoft Corp.", market: "US", exchange: "NASDAQ", currency: "USD", sector: "Big Tech" },
  { symbol: "GOOGL", name: "Alphabet Inc.", market: "US", exchange: "NASDAQ", currency: "USD", sector: "Big Tech" },
  { symbol: "AMZN", name: "Amazon.com Inc.", market: "US", exchange: "NASDAQ", currency: "USD", sector: "Big Tech" },
  { symbol: "META", name: "Meta Platforms Inc.", market: "US", exchange: "NASDAQ", currency: "USD", sector: "Big Tech" },
  { symbol: "TSLA", name: "Tesla Inc.", market: "US", exchange: "NASDAQ", currency: "USD", sector: "Otomotif & Media" },
  { symbol: "NFLX", name: "Netflix Inc.", market: "US", exchange: "NASDAQ", currency: "USD", sector: "Otomotif & Media" },
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
