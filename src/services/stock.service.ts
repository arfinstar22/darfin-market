import {
  POPULAR_IDX_STOCKS,
  POPULAR_IDX_SYMBOL_SET,
  POPULAR_US_STOCKS,
  POPULAR_US_SYMBOL_SET,
  type CuratedStock,
} from "../config/constants.js";
import type { AlphaVantageProvider } from "../providers/alphavantage/provider.js";
import type { FinnhubProvider } from "../providers/finnhub/provider.js";
import type { TwelveDataProvider } from "../providers/twelvedata/provider.js";
import type { AssetSearchResult, MarketTicker } from "../types/market.js";
import { logger } from "../utils/logger.js";

export interface StockLookupResult {
  query: string;
  market: "IDX" | "US" | "GLOBAL";
  ticker: MarketTicker | null;
  error?: string;
  unconfiguredHint?: string;
}

export interface ParsedStockInput {
  symbol: string;
  exchange?: string;
  market: "IDX" | "US" | "GLOBAL";
}

export function parseStockInput(raw: string): ParsedStockInput {
  const cleaned = raw.trim().toUpperCase();

  // Explicit IDX suffixes: BBCA.JK, BBCA:IDX, IDX:BBCA
  if (cleaned.endsWith(".JK")) {
    return { symbol: cleaned.slice(0, -3), exchange: "IDX", market: "IDX" };
  }
  if (cleaned.endsWith(":IDX")) {
    return { symbol: cleaned.slice(0, -4), exchange: "IDX", market: "IDX" };
  }
  if (cleaned.startsWith("IDX:")) {
    return { symbol: cleaned.slice(4), exchange: "IDX", market: "IDX" };
  }

  // Generic exchange notation: SYMBOL:EXCHANGE
  if (cleaned.includes(":")) {
    const [sym, ex] = cleaned.split(":");
    const exchange = ex || undefined;
    const market = exchange === "IDX" ? "IDX" : exchange === "NASDAQ" || exchange === "NYSE" ? "US" : "GLOBAL";
    return { symbol: sym ?? cleaned, exchange, market };
  }

  // Known popular IDX tickers (BBCA, BBRI, TLKM, BMRI, etc.)
  if (POPULAR_IDX_SYMBOL_SET.has(cleaned)) {
    return { symbol: cleaned, exchange: "IDX", market: "IDX" };
  }

  // Known popular US tickers (AAPL, NVDA, MSFT, etc.)
  if (POPULAR_US_SYMBOL_SET.has(cleaned)) {
    return { symbol: cleaned, market: "US" };
  }

  // Default to US/Global
  return { symbol: cleaned, market: "US" };
}

export class StockService {
  constructor(
    private readonly finnhub: FinnhubProvider,
    private readonly twelvedata: TwelveDataProvider,
    private readonly alphavantage: AlphaVantageProvider,
  ) {}

  getPopularIdxStocks(): readonly CuratedStock[] {
    return POPULAR_IDX_STOCKS;
  }

  getPopularUsStocks(): readonly CuratedStock[] {
    return POPULAR_US_STOCKS;
  }

  hasAnyConfiguredProvider(): boolean {
    return (
      this.finnhub.isConfigured() ||
      this.twelvedata.isConfigured() ||
      this.alphavantage.isConfigured()
    );
  }

  async lookupStock(rawInput: string): Promise<StockLookupResult> {
    const parsed = parseStockInput(rawInput);

    if (parsed.market === "IDX") {
      return this.lookupIdxStock(parsed);
    }
    return this.lookupGlobalOrUsStock(parsed);
  }

  private async lookupIdxStock(parsed: ParsedStockInput): Promise<StockLookupResult> {
    if (!this.twelvedata.isConfigured() && !this.alphavantage.isConfigured()) {
      return {
        query: parsed.symbol,
        market: "IDX",
        ticker: null,
        unconfiguredHint:
          "Provider saham Indonesia (IDX) belum aktif. Tambahkan TWELVE_DATA_API_KEY di file .env untuk memantau saham IDX seperti BBCA, BBRI, TLKM, BMRI.",
      };
    }

    const errors: string[] = [];

    if (this.twelvedata.isConfigured()) {
      try {
        const ticker = await this.twelvedata.getQuote({
          symbol: parsed.symbol,
          exchange: "IDX",
        });
        if (ticker) {
          return { query: parsed.symbol, market: "IDX", ticker };
        }
      } catch (error) {
        logger.warn({ symbol: parsed.symbol, err: String(error) }, "TwelveData IDX quote failed");
        const msg =
          error instanceof Error && "statusCode" in error && (error as { statusCode?: number }).statusCode === 403
            ? "Twelve Data (IDX butuh plan Pro)"
            : "Twelve Data";
        errors.push(msg);
      }
    }

    if (this.alphavantage.isConfigured()) {
      try {
        const ticker = await this.alphavantage.getQuote({
          symbol: parsed.symbol,
          exchange: "IDX",
        });
        if (ticker) {
          return { query: parsed.symbol, market: "IDX", ticker };
        }
      } catch (error) {
        logger.warn({ symbol: parsed.symbol, err: String(error) }, "AlphaVantage IDX quote failed");
        errors.push("Alpha Vantage");
      }
    }

    return {
      query: parsed.symbol,
      market: "IDX",
      ticker: null,
      error:
        errors.length > 0
          ? `Provider saham (${errors.join(", ")}) sedang bermasalah atau simbol tidak tersedia di plan saat ini.`
          : undefined,
    };
  }

  private async lookupGlobalOrUsStock(parsed: ParsedStockInput): Promise<StockLookupResult> {
    if (!this.hasAnyConfiguredProvider()) {
      return {
        query: parsed.symbol,
        market: parsed.market,
        ticker: null,
        unconfiguredHint:
          "Provider saham belum aktif. Tambahkan FINNHUB_API_KEY (US real-time) dan/atau TWELVE_DATA_API_KEY (IDX & Global) di file .env.",
      };
    }

    const errors: string[] = [];

    // 1. Finnhub first for US stocks (real-time US trade quote, 60 req/min free)
    if (parsed.market === "US" && !parsed.exchange && this.finnhub.isConfigured()) {
      try {
        const ticker = await this.finnhub.getQuote({ symbol: parsed.symbol });
        if (ticker) {
          return { query: parsed.symbol, market: "US", ticker };
        }
      } catch (error) {
        logger.warn({ symbol: parsed.symbol, err: String(error) }, "Finnhub US quote failed");
        errors.push("Finnhub");
      }
    }

    // 2. Twelve Data for global / US fallback
    if (this.twelvedata.isConfigured()) {
      try {
        const ticker = await this.twelvedata.getQuote({
          symbol: parsed.symbol,
          exchange: parsed.exchange,
        });
        if (ticker) {
          return { query: parsed.symbol, market: parsed.market, ticker };
        }
      } catch (error) {
        logger.warn({ symbol: parsed.symbol, err: String(error) }, "TwelveData quote failed");
        errors.push("Twelve Data");
      }
    }

    // 3. Alpha Vantage optional fallback (EOD/delayed)
    if (this.alphavantage.isConfigured()) {
      try {
        const ticker = await this.alphavantage.getQuote({
          symbol: parsed.symbol,
          exchange: parsed.exchange,
        });
        if (ticker) {
          return { query: parsed.symbol, market: parsed.market, ticker };
        }
      } catch (error) {
        logger.warn({ symbol: parsed.symbol, err: String(error) }, "AlphaVantage quote failed");
        errors.push("Alpha Vantage");
      }
    }

    return {
      query: parsed.symbol,
      market: parsed.market,
      ticker: null,
      error:
        errors.length > 0
          ? `Provider saham (${errors.join(", ")}) sedang tidak dapat dihubungi.`
          : undefined,
    };
  }

  async searchStocks(query: string, limit = 8): Promise<AssetSearchResult[]> {
    const clean = query.trim().toUpperCase();
    if (!clean) return [];

    const results: AssetSearchResult[] = [];
    const seen = new Set<string>();

    // Instant curated match for popular IDX & US stocks
    for (const s of [...POPULAR_IDX_STOCKS, ...POPULAR_US_STOCKS]) {
      if (s.symbol.includes(clean) || s.name.toUpperCase().includes(clean)) {
        const key = `${s.symbol}:${s.exchange}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            provider: s.market === "IDX" ? "twelvedata" : "finnhub",
            assetClass: "stock",
            assetId: s.market === "IDX" ? `${s.symbol}:IDX` : s.symbol,
            symbol: s.symbol,
            name: s.name,
            exchange: s.exchange,
            market: s.market,
            currency: s.currency,
          });
        }
      }
    }

    const remoteCalls: Promise<AssetSearchResult[]>[] = [];
    if (this.twelvedata.isConfigured()) {
      remoteCalls.push(this.twelvedata.searchStocks(query, limit));
    }
    if (this.finnhub.isConfigured()) {
      remoteCalls.push(this.finnhub.searchStocks(query, limit));
    }

    const settled = await Promise.allSettled(remoteCalls);
    for (const res of settled) {
      if (res.status !== "fulfilled") continue;
      for (const item of res.value) {
        const key = `${item.symbol}:${item.exchange ?? item.market ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(item);
        }
      }
    }

    return results.slice(0, limit);
  }
}
