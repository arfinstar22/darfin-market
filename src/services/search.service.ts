import type { CoinPaprikaProvider } from "../providers/coinpaprika/provider.js";
import type { AssetSearchResult } from "../types/market.js";
import type { StockService } from "./stock.service.js";

export class SearchService {
  constructor(
    private readonly coinpaprika: CoinPaprikaProvider,
    private readonly stockService: StockService,
  ) {}

  async searchCrypto(query: string, limit = 8): Promise<AssetSearchResult[]> {
    const clean = query.trim();
    if (clean.length < 1 || clean.length > 50) return [];
    return this.coinpaprika.searchAssets(clean, limit);
  }

  async searchStocks(query: string, limit = 8): Promise<AssetSearchResult[]> {
    const clean = query.trim();
    if (clean.length < 1 || clean.length > 50) return [];
    return this.stockService.searchStocks(clean, limit);
  }
}
