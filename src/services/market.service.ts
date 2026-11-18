import { POPULAR_INDODAX_PAIRS } from "../config/constants.js";
import type { CoinPaprikaProvider } from "../providers/coinpaprika/provider.js";
import type { FrankfurterProvider } from "../providers/frankfurter/provider.js";
import type { IndodaxProvider } from "../providers/indodax/provider.js";
import type {
  AssetSearchResult,
  FxRate,
  GlobalMarketStats,
  MarketTicker,
} from "../types/market.js";
import { toDecimal } from "../utils/decimal.js";
import { logger } from "../utils/logger.js";

export interface MarketOverviewResult {
  globalStats: GlobalMarketStats | null;
  globalError?: string;
  indodaxTickers: MarketTicker[];
  indodaxError?: string;
  usdIdrRate: FxRate | null;
  fxError?: string;
}

export interface CryptoLookupResult {
  query: string;
  indodaxTicker: MarketTicker | null;
  indodaxError?: string;
  globalTicker: MarketTicker | null;
  globalError?: string;
  ambiguousCandidates: AssetSearchResult[];
}

export class MarketService {
  constructor(
    private readonly indodax: IndodaxProvider,
    private readonly coinpaprika: CoinPaprikaProvider,
    private readonly frankfurter: FrankfurterProvider,
  ) {}

  async getMarketOverview(): Promise<MarketOverviewResult> {
    const [globalRes, indodaxRes, fxRes] = await Promise.allSettled([
      this.coinpaprika.getGlobalStats(),
      this.getPopularIndodaxTickers(["btcidr", "ethidr", "usdtidr"]),
      this.frankfurter.getRate("USD", "IDR"),
    ]);

    const result: MarketOverviewResult = {
      globalStats: null,
      indodaxTickers: [],
      usdIdrRate: null,
    };

    if (globalRes.status === "fulfilled") {
      result.globalStats = globalRes.value;
    } else {
      logger.warn({ err: String(globalRes.reason) }, "Market overview: CoinPaprika failed");
      result.globalError = "CoinPaprika sedang tidak dapat dihubungi.";
    }

    if (indodaxRes.status === "fulfilled") {
      result.indodaxTickers = indodaxRes.value;
    } else {
      logger.warn({ err: String(indodaxRes.reason) }, "Market overview: INDODAX failed");
      result.indodaxError = "INDODAX sedang tidak dapat dihubungi.";
    }

    if (fxRes.status === "fulfilled") {
      result.usdIdrRate = fxRes.value;
      if (!fxRes.value) {
        result.fxError = "Kurs referensi USD/IDR tidak tersedia.";
      }
    } else {
      logger.warn({ err: String(fxRes.reason) }, "Market overview: Frankfurter failed");
      result.fxError = "Frankfurter sedang tidak dapat dihubungi.";
    }

    return result;
  }

  async getPopularIndodaxTickers(
    pairIds: readonly string[] = POPULAR_INDODAX_PAIRS.slice(0, 5),
  ): Promise<MarketTicker[]> {
    const all = await this.indodax.getAllTickers();
    const map = new Map(all.map((t) => [t.assetId.toLowerCase(), t]));
    const found: MarketTicker[] = [];
    for (const id of pairIds) {
      const ticker = map.get(id.toLowerCase());
      if (ticker) found.push(ticker);
    }
    return found;
  }

  async lookupCrypto(input: string): Promise<CryptoLookupResult> {
    const clean = input.trim();
    const upper = clean.toUpperCase();
    const isDirectCoinId = clean.includes("-");

    const [indodaxRes, globalRes] = await Promise.allSettled([
      isDirectCoinId
        ? this.resolveIndodaxFromCoinId(clean)
        : this.indodax.getTicker(upper, "IDR"),
      this.resolveCoinPaprika(clean),
    ]);

    const result: CryptoLookupResult = {
      query: upper,
      indodaxTicker: null,
      globalTicker: null,
      ambiguousCandidates: [],
    };

    if (indodaxRes.status === "fulfilled") {
      result.indodaxTicker = indodaxRes.value;
    } else {
      logger.warn({ query: clean, err: String(indodaxRes.reason) }, "INDODAX lookup failed");
      result.indodaxError = "INDODAX sedang tidak dapat dihubungi.";
    }

    if (globalRes.status === "fulfilled") {
      result.globalTicker = globalRes.value.ticker;
      result.ambiguousCandidates = globalRes.value.ambiguousCandidates;
      // If lookup was by CoinPaprika coin_id and INDODAX wasn't found yet, try matching by symbol
      if (!result.indodaxTicker && result.globalTicker && isDirectCoinId) {
        try {
          result.indodaxTicker = await this.indodax.getTicker(result.globalTicker.symbol, "IDR");
        } catch {
          // ignore secondary lookup error
        }
      }
    } else {
      logger.warn({ query: clean, err: String(globalRes.reason) }, "CoinPaprika lookup failed");
      result.globalError = "CoinPaprika sedang tidak dapat dihubungi.";
    }

    return result;
  }

  private async resolveIndodaxFromCoinId(coinId: string): Promise<MarketTicker | null> {
    const prefix = coinId.split("-")[0];
    if (!prefix) return null;
    return this.indodax.getTicker(prefix.toUpperCase(), "IDR");
  }

  private async resolveCoinPaprika(
    input: string,
  ): Promise<{ ticker: MarketTicker | null; ambiguousCandidates: AssetSearchResult[] }> {
    if (input.includes("-")) {
      const ticker = await this.coinpaprika.getTickerByCoinId(input.toLowerCase());
      return { ticker, ambiguousCandidates: [] };
    }

    const candidates = await this.coinpaprika.resolveSymbolCandidates(input);
    if (candidates.length === 0) {
      return { ticker: null, ambiguousCandidates: [] };
    }

    const upper = input.toUpperCase();
    const exactSymbolMatches = candidates.filter((c) => c.symbol.toUpperCase() === upper);

    // If multiple active coins share the exact same symbol and the top one is NOT clearly dominant (rank > 50), ask user to choose
    if (exactSymbolMatches.length > 1) {
      const topRank = exactSymbolMatches[0]?.rank ?? 9999;
      const secondRank = exactSymbolMatches[1]?.rank ?? 9999;
      const clearlyDominant = topRank <= 30 && secondRank > topRank * 5;
      if (!clearlyDominant) {
        return { ticker: null, ambiguousCandidates: exactSymbolMatches.slice(0, 6) };
      }
    }

    const chosen = exactSymbolMatches[0] ?? candidates[0];
    if (!chosen) return { ticker: null, ambiguousCandidates: [] };
    const ticker = await this.coinpaprika.getTickerByCoinId(chosen.assetId);
    return { ticker, ambiguousCandidates: [] };
  }

  async getTopMovers(direction: "gainers" | "losers", limit = 10): Promise<MarketTicker[]> {
    const all = await this.coinpaprika.getAllTickers();
    const valid = all.filter((t) => {
      if (t.change24hPercent === undefined) return false;
      try {
        const pct = toDecimal(t.change24hPercent);
        const price = toDecimal(t.price);
        return price.gt(0) && pct.isFinite();
      } catch {
        return false;
      }
    });

    valid.sort((a, b) => {
      const da = toDecimal(a.change24hPercent!);
      const db = toDecimal(b.change24hPercent!);
      return direction === "gainers" ? db.cmp(da) : da.cmp(db);
    });

    return valid.slice(0, limit);
  }
}
