import { describe, expect, it, vi } from "vitest";
import { MemoryCacheService } from "../../src/cache/redis.js";
import type { CoinPaprikaClient } from "../../src/providers/coinpaprika/client.js";
import { CoinPaprikaProvider } from "../../src/providers/coinpaprika/provider.js";
import type { FrankfurterClient } from "../../src/providers/frankfurter/client.js";
import { FrankfurterProvider } from "../../src/providers/frankfurter/provider.js";
import type { IndodaxClient } from "../../src/providers/indodax/client.js";
import { IndodaxProvider } from "../../src/providers/indodax/provider.js";
import { MarketService } from "../../src/services/market.service.js";
import { ProviderError } from "../../src/utils/errors.js";

describe("Providers parsing, caching, and partial outage isolation", () => {
  it("normalizes INDODAX pair + summaries and computes 24h change without faking unknown pairs", async () => {
    const cache = new MemoryCacheService();
    const mockClient = {
      getPairs: vi.fn().mockResolvedValue({
        pairs: [
          {
            id: "btcidr",
            symbol: "BTCIDR",
            base_currency: "idr",
            traded_currency: "btc",
            traded_currency_unit: "BTC",
            description: "BTC/IDR",
            ticker_id: "btc_idr",
            is_maintenance: 0,
            is_market_suspended: 0,
          },
        ],
        latencyMs: 50,
      }),
      getSummaries: vi.fn().mockResolvedValue({
        summaries: {
          tickers: {
            btc_idr: {
              buy: "1180431000",
              high: "1197339000",
              last: "1180000000",
              low: "1160001000",
              sell: "1180432000",
              server_time: Math.floor(Date.now() / 1000),
              vol_btc: "21.04",
              vol_idr: "24909010537",
              name: "Bitcoin",
            },
          },
          prices_24h: {
            btcidr: "1150000000",
          },
        },
        latencyMs: 60,
      }),
    } as unknown as IndodaxClient;

    const provider = new IndodaxProvider(cache, mockClient);
    const btc = await provider.getTicker("BTC", "IDR");
    expect(btc).not.toBeNull();
    expect(btc?.price).toBe("1180000000");
    expect(btc?.quoteCurrency).toBe("IDR");
    expect(btc?.sourceLabel).toBe("Sumber: INDODAX");
    expect(btc?.change24hPercent).toBe("2.6087");

    // Second call uses cache — should NOT re-hit INDODAX
    await provider.getTicker("BTC", "IDR");
    expect(mockClient.getSummaries).toHaveBeenCalledTimes(1);

    // Unknown pair returns null, never silently substitutes another pair
    const unknown = await provider.getTicker("NONEXISTENT", "IDR");
    expect(unknown).toBeNull();
  });

  it("handles CoinPaprika top movers by excluding null 24h changes", async () => {
    const cache = new MemoryCacheService();
    const mockCp = {
      getTickers: vi.fn().mockResolvedValue({
        tickers: [
          {
            id: "btc-bitcoin",
            name: "Bitcoin",
            symbol: "BTC",
            last_updated: new Date().toISOString(),
            quotes: { USD: { price: 65000, percent_change_24h: 2.5 } },
          },
          {
            id: "null-coin",
            name: "NullCoin",
            symbol: "NULL",
            last_updated: new Date().toISOString(),
            quotes: { USD: { price: 1, percent_change_24h: null } },
          },
          {
            id: "sol-solana",
            name: "Solana",
            symbol: "SOL",
            last_updated: new Date().toISOString(),
            quotes: { USD: { price: 180, percent_change_24h: -4.2 } },
          },
        ],
        latencyMs: 80,
      }),
    } as unknown as CoinPaprikaClient;

    const cp = new CoinPaprikaProvider(cache, mockCp);
    const indodax = new IndodaxProvider(cache, {} as IndodaxClient);
    const fx = new FrankfurterProvider(cache, {} as FrankfurterClient);
    const market = new MarketService(indodax, cp, fx);

    const gainers = await market.getTopMovers("gainers", 10);
    expect(gainers.map((g) => g.symbol)).toEqual(["BTC", "SOL"]);
    const losers = await market.getTopMovers("losers", 10);
    expect(losers.map((l) => l.symbol)).toEqual(["SOL", "BTC"]);
  });

  it("isolates partial provider failures in /market overview", async () => {
    const cache = new MemoryCacheService();

    const failingCp = {
      getGlobal: vi.fn().mockRejectedValue(new ProviderError("coinpaprika", "HTTP 503", 503, true)),
    } as unknown as CoinPaprikaClient;

    const workingIndodax = {
      getPairs: vi.fn().mockResolvedValue({
        pairs: [
          {
            id: "btcidr",
            symbol: "BTCIDR",
            base_currency: "idr",
            traded_currency: "btc",
            traded_currency_unit: "BTC",
            description: "BTC/IDR",
            ticker_id: "btc_idr",
            is_maintenance: 0,
            is_market_suspended: 0,
          },
        ],
        latencyMs: 30,
      }),
      getSummaries: vi.fn().mockResolvedValue({
        summaries: {
          tickers: {
            btc_idr: {
              buy: "1180000000",
              high: "1190000000",
              last: "1180000000",
              low: "1160000000",
              sell: "1181000000",
              server_time: Math.floor(Date.now() / 1000),
            },
          },
        },
        latencyMs: 40,
      }),
    } as unknown as IndodaxClient;

    const workingFx = {
      getRates: vi.fn().mockResolvedValue({
        rates: [{ date: "2026-11-18", base: "USD", quote: "IDR", rate: "18249" }],
        latencyMs: 35,
      }),
      getCurrencies: vi.fn().mockResolvedValue({
        currencies: [
          { iso_code: "USD", name: "US Dollar" },
          { iso_code: "IDR", name: "Indonesian Rupiah" },
        ],
        latencyMs: 25,
      }),
    } as unknown as FrankfurterClient;

    const market = new MarketService(
      new IndodaxProvider(cache, workingIndodax),
      new CoinPaprikaProvider(cache, failingCp),
      new FrankfurterProvider(cache, workingFx),
    );

    const overview = await market.getMarketOverview();
    expect(overview.globalStats).toBeNull();
    expect(overview.globalError).toBeDefined();
    expect(overview.indodaxTickers.length).toBe(1);
    expect(overview.usdIdrRate?.rate).toBe("18249");
  });
});
