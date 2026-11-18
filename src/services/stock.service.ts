import {
  POPULAR_IDX_STOCKS,
  POPULAR_IDX_SYMBOL_SET,
  POPULAR_US_STOCKS,
  POPULAR_US_SYMBOL_SET,
  type CuratedStock,
} from "../config/constants.js";
import type { AlphaVantageProvider } from "../providers/alphavantage/provider.js";
import type { FinnhubProvider } from "../providers/finnhub/provider.js";
import type { GoApiIdxProvider } from "../providers/goapi/provider.js";
import type { TwelveDataProvider } from "../providers/twelvedata/provider.js";
import type { YahooFinanceIdxProvider } from "../providers/yahoo/provider.js";
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

  if (cleaned.endsWith(".JK")) {
    return { symbol: cleaned.slice(0, -3), exchange: "IDX", market: "IDX" };
  }
  if (cleaned.endsWith(":IDX")) {
    return { symbol: cleaned.slice(0, -4), exchange: "IDX", market: "IDX" };
  }
  if (cleaned.startsWith("IDX:")) {
    return { symbol: cleaned.slice(4), exchange: "IDX", market: "IDX" };
  }

  if (cleaned.includes(":")) {
    const [sym, ex] = cleaned.split(":");
    const exchange = ex || undefined;
    const market =
      exchange === "IDX"
        ? "IDX"
        : exchange === "NASDAQ" || exchange === "NYSE"
          ? "US"
          : "GLOBAL";
    return { symbol: sym ?? cleaned, exchange, market };
  }

  if (POPULAR_IDX_SYMBOL_SET.has(cleaned)) {
    return { symbol: cleaned, exchange: "IDX", market: "IDX" };
  }

  if (POPULAR_US_SYMBOL_SET.has(cleaned)) {
    return { symbol: cleaned, market: "US" };
  }

  return { symbol: cleaned, market: "US" };
}

export class StockService {
  constructor(
    private readonly finnhub: FinnhubProvider,
    private readonly twelvedata: TwelveDataProvider,
    private readonly alphavantage: AlphaVantageProvider,
    private readonly goapi?: GoApiIdxProvider,
    private readonly yahoo?: YahooFinanceIdxProvider,
  ) {}

  getPopularIdxStocks(): readonly CuratedStock[] {
    return POPULAR_IDX_STOCKS;
  }

  getPopularUsStocks(): readonly CuratedStock[] {
    return POPULAR_US_STOCKS;
  }

  hasAnyConfiguredProvider(): boolean {
    return (
      Boolean(this.yahoo?.isConfigured()) ||
      Boolean(this.goapi?.isConfigured()) ||
      this.finnhub.isConfigured() ||
      this.twelvedata.isConfigured() ||
      this.alphavantage.isConfigured()
    );
  }

  hasIdxProviderConfigured(): boolean {
    return (
      Boolean(this.goapi?.isConfigured()) ||
      Boolean(this.yahoo?.isConfigured()) ||
      this.twelvedata.isConfigured() ||
      this.alphavantage.isConfigured()
    );
  }

  /**
   * Batch lookup for IDX stocks — single batch call via GoAPI (if key set) or Yahoo Finance (.JK).
   */
  async lookupIdxBatch(symbols: string[]): Promise<Map<string, StockLookupResult>> {
    const results = new Map<string, StockLookupResult>();
    const cleanSymbols = symbols.map((s) => s.trim().toUpperCase().replace(".JK", "").replace(":IDX", ""));

    if (this.goapi?.isConfigured()) {
      try {
        const batchMap = await this.goapi.getBatchQuotes(cleanSymbols);
        for (const sym of cleanSymbols) {
          const ticker = batchMap.get(sym) ?? null;
          results.set(sym, { query: sym, market: "IDX", ticker });
        }
        return results;
      } catch (error) {
        logger.warn({ err: String(error) }, "GoAPI batch IDX fetch failed, trying Yahoo Finance");
      }
    }

    if (this.yahoo?.isConfigured()) {
      try {
        const batchMap = await this.yahoo.getBatchIdxQuotes(cleanSymbols);
        for (const sym of cleanSymbols) {
          const ticker = batchMap.get(sym) ?? null;
          results.set(sym, { query: sym, market: "IDX", ticker });
        }
        return results;
      } catch (error) {
        logger.warn({ err: String(error) }, "Yahoo Finance batch IDX fetch failed");
      }
    }

    await Promise.all(
      cleanSymbols.map(async (sym) => {
        const res = await this.lookupIdxStock({ symbol: sym, exchange: "IDX", market: "IDX" });
        results.set(sym, res);
      }),
    );
    return results;
  }

  async lookupStock(rawInput: string): Promise<StockLookupResult> {
    const parsed = parseStockInput(rawInput);

    if (parsed.market === "IDX") {
      return this.lookupIdxStock(parsed);
    }
    return this.lookupGlobalOrUsStock(parsed);
  }

  private async lookupIdxStock(parsed: ParsedStockInput): Promise<StockLookupResult> {
    if (!this.hasIdxProviderConfigured()) {
      return {
        query: parsed.symbol,
        market: "IDX",
        ticker: null,
        unconfiguredHint:
          "Provider saham Indonesia (IDX) belum aktif. Tambahkan GOAPI_API_KEY (gratis di goapi.io) di Environment Render / .env untuk memantau BBCA, BBRI, TLKM, BMRI, dll.",
      };
    }

    const errors: string[] = [];

    // 1. GoAPI.io first if key configured
    if (this.goapi?.isConfigured()) {
      try {
        const ticker = await this.goapi.getQuote({ symbol: parsed.symbol, exchange: "IDX" });
        if (ticker) {
          return { query: parsed.symbol, market: "IDX", ticker };
        }
      } catch (error) {
        logger.warn({ symbol: parsed.symbol, err: String(error) }, "GoAPI IDX quote failed");
        errors.push("GoAPI.io");
      }
    }

    // 2. Yahoo Finance (.JK) — free IDX quotes (~15m delay)
    if (this.yahoo?.isConfigured()) {
      try {
        const ticker = await this.yahoo.getQuote({ symbol: parsed.symbol, exchange: "IDX" });
        if (ticker) {
          return { query: parsed.symbol, market: "IDX", ticker };
        }
      } catch (error) {
        logger.warn({ symbol: parsed.symbol, err: String(error) }, "Yahoo IDX quote failed");
        errors.push("Yahoo Finance");
      }
    }

    // 2. Twelve Data fallback (IDX requires Pro plan on Twelve Data)
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
          error instanceof Error &&
          "statusCode" in error &&
          (error as { statusCode?: number }).statusCode === 403
            ? "Twelve Data (IDX butuh plan Pro — gunakan GOAPI_API_KEY gratis dari goapi.io)"
            : "Twelve Data";
        errors.push(msg);
      }
    }

    // 3. Alpha Vantage optional fallback
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
          ? `Provider saham IDX: ${errors.join("; ")}.`
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
          "Provider saham belum aktif. Tambahkan FINNHUB_API_KEY (US real-time) dan/atau GOAPI_API_KEY (IDX) di Environment.",
      };
    }

    const errors: string[] = [];

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

    for (const s of [...POPULAR_IDX_STOCKS, ...POPULAR_US_STOCKS]) {
      if (s.symbol.includes(clean) || s.name.toUpperCase().includes(clean)) {
        const key = `${s.symbol}:${s.exchange}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            provider: s.market === "IDX" ? "goapi" : "finnhub",
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
    if (this.goapi?.isConfigured()) {
      remoteCalls.push(this.goapi.searchStocks(query, limit));
    }
    if (this.yahoo?.isConfigured()) {
      remoteCalls.push(this.yahoo.searchStocks(query, limit));
    }
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
