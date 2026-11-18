import { env } from "../config/env.js";
import type { WatchlistRepository } from "../db/repositories/watchlist.repo.js";
import type { WatchlistItemRow } from "../db/schema/index.js";
import type { CoinPaprikaProvider } from "../providers/coinpaprika/provider.js";
import type { IndodaxProvider } from "../providers/indodax/provider.js";
import type { MarketTicker } from "../types/market.js";
import { ValidationError } from "../utils/errors.js";
import type { MarketService } from "./market.service.js";
import type { StockService } from "./stock.service.js";

export interface WatchlistViewItem {
  row: WatchlistItemRow;
  ticker: MarketTicker | null;
  error?: string;
}

export class WatchlistService {
  constructor(
    private readonly repo: WatchlistRepository,
    private readonly indodax: IndodaxProvider,
    private readonly coinpaprika: CoinPaprikaProvider,
    private readonly marketService: MarketService,
    private readonly stockService: StockService,
  ) {}

  async addByInput(
    userId: string,
    rawInput: string,
    mode: "auto" | "crypto" | "stock" = "auto",
  ): Promise<{ item: WatchlistItemRow; created: boolean }> {
    const currentCount = await this.repo.countByUser(userId);
    if (currentCount >= env.MAX_WATCHLIST_ITEMS) {
      throw new ValidationError(
        `Watchlist sudah mencapai batas maksimal ${env.MAX_WATCHLIST_ITEMS} aset. Hapus item lama terlebih dahulu.`,
      );
    }

    const clean = rawInput.trim();
    if (!clean) {
      throw new ValidationError("Masukkan simbol aset. Contoh: /watchadd BTC atau /watchadd BBCA");
    }

    // Try stock first when explicitly stock or IDX suffix (.JK / :IDX)
    const isExplicitStock =
      mode === "stock" ||
      clean.toUpperCase().endsWith(".JK") ||
      clean.toUpperCase().endsWith(":IDX") ||
      clean.toUpperCase().startsWith("IDX:");

    if (isExplicitStock) {
      const stockRes = await this.stockService.lookupStock(clean);
      if (stockRes.ticker) {
        return this.repo.add({
          userId,
          assetClass: "stock",
          assetId: stockRes.ticker.assetId,
          symbol: stockRes.ticker.symbol,
          name: stockRes.ticker.name ?? stockRes.ticker.symbol,
          provider: stockRes.ticker.provider,
          marketPair: stockRes.ticker.exchange ?? null,
          quoteCurrency: stockRes.ticker.quoteCurrency,
        });
      }
      if (stockRes.unconfiguredHint) {
        throw new ValidationError(stockRes.unconfiguredHint);
      }
      throw new ValidationError(`Saham ${clean.toUpperCase()} tidak ditemukan.`);
    }

    // Try crypto (INDODAX IDR preferred, then CoinPaprika USD)
    const cryptoRes = await this.marketService.lookupCrypto(clean);
    if (cryptoRes.indodaxTicker) {
      return this.repo.add({
        userId,
        assetClass: "crypto",
        assetId: cryptoRes.indodaxTicker.assetId,
        symbol: cryptoRes.indodaxTicker.symbol,
        name: cryptoRes.indodaxTicker.name ?? cryptoRes.indodaxTicker.symbol,
        provider: "indodax",
        marketPair: cryptoRes.indodaxTicker.marketPair ?? null,
        quoteCurrency: cryptoRes.indodaxTicker.quoteCurrency,
      });
    }
    if (cryptoRes.globalTicker) {
      return this.repo.add({
        userId,
        assetClass: "crypto",
        assetId: cryptoRes.globalTicker.assetId,
        symbol: cryptoRes.globalTicker.symbol,
        name: cryptoRes.globalTicker.name ?? cryptoRes.globalTicker.symbol,
        provider: "coinpaprika",
        marketPair: null,
        quoteCurrency: cryptoRes.globalTicker.quoteCurrency,
      });
    }

    // Fallback to stock if auto mode
    if (mode === "auto") {
      const stockRes = await this.stockService.lookupStock(clean);
      if (stockRes.ticker) {
        return this.repo.add({
          userId,
          assetClass: "stock",
          assetId: stockRes.ticker.assetId,
          symbol: stockRes.ticker.symbol,
          name: stockRes.ticker.name ?? stockRes.ticker.symbol,
          provider: stockRes.ticker.provider,
          marketPair: stockRes.ticker.exchange ?? null,
          quoteCurrency: stockRes.ticker.quoteCurrency,
        });
      }
    }

    throw new ValidationError("Aset tidak ditemukan. Coba simbol atau nama lain.");
  }

  async addExplicit(
    userId: string,
    payload: {
      assetClass: "crypto" | "stock";
      assetId: string;
      symbol: string;
      name?: string;
      provider: string;
      marketPair?: string | null;
      quoteCurrency: string;
    },
  ): Promise<{ item: WatchlistItemRow; created: boolean }> {
    const currentCount = await this.repo.countByUser(userId);
    if (currentCount >= env.MAX_WATCHLIST_ITEMS) {
      throw new ValidationError(
        `Watchlist sudah mencapai batas maksimal ${env.MAX_WATCHLIST_ITEMS} aset.`,
      );
    }
    return this.repo.add({
      userId,
      ...payload,
    });
  }

  async removeBySymbol(userId: string, symbol: string): Promise<number> {
    const clean = symbol.trim().toUpperCase().replace(".JK", "").replace(":IDX", "");
    return this.repo.removeBySymbol(userId, clean);
  }

  async removeById(userId: string, itemId: string): Promise<boolean> {
    return this.repo.removeById(userId, itemId);
  }

  async getWatchlistWithPrices(userId: string): Promise<WatchlistViewItem[]> {
    const rows = await this.repo.listByUser(userId);
    if (rows.length === 0) return [];

    // Pre-fetch INDODAX batch once if any indodax items exist
    const hasIndodax = rows.some((r) => r.provider === "indodax");
    let indodaxMap = new Map<string, MarketTicker>();
    let indodaxFailed = false;
    if (hasIndodax) {
      try {
        const all = await this.indodax.getAllTickers();
        indodaxMap = new Map(all.map((t) => [t.assetId.toLowerCase(), t]));
      } catch {
        indodaxFailed = true;
      }
    }

    const items = await Promise.all(
      rows.map(async (row): Promise<WatchlistViewItem> => {
        try {
          if (row.provider === "indodax") {
            if (indodaxFailed) return { row, ticker: null, error: "INDODAX tidak dapat dihubungi" };
            const ticker = indodaxMap.get(row.assetId.toLowerCase()) ?? null;
            return { row, ticker };
          }
          if (row.provider === "coinpaprika") {
            const ticker = await this.coinpaprika.getTickerByCoinId(row.assetId);
            return { row, ticker };
          }
          // Stock providers
          const stockQuery = row.assetId.includes(":") ? row.assetId : row.symbol;
          const res = await this.stockService.lookupStock(stockQuery);
          return { row, ticker: res.ticker, error: res.error ?? res.unconfiguredHint };
        } catch {
          return { row, ticker: null, error: "Provider tidak tersedia" };
        }
      }),
    );

    return items;
  }
}
