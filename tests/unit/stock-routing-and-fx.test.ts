import { describe, expect, it, vi } from "vitest";
import { MemoryCacheService } from "../../src/cache/redis.js";
import type { AlphaVantageClient } from "../../src/providers/alphavantage/client.js";
import { AlphaVantageProvider } from "../../src/providers/alphavantage/provider.js";
import type { FinnhubClient } from "../../src/providers/finnhub/client.js";
import { FinnhubProvider } from "../../src/providers/finnhub/provider.js";
import type { FrankfurterClient } from "../../src/providers/frankfurter/client.js";
import { FrankfurterProvider } from "../../src/providers/frankfurter/provider.js";
import type { TwelveDataClient } from "../../src/providers/twelvedata/client.js";
import { TwelveDataProvider } from "../../src/providers/twelvedata/provider.js";
import { FxService } from "../../src/services/fx.service.js";
import { parseStockInput, StockService } from "../../src/services/stock.service.js";
import { ValidationError } from "../../src/utils/errors.js";

describe("Stock routing (Indonesia IDX & International US) and FX conversion", () => {
  it("parses IDX and US stock symbols accurately", () => {
    expect(parseStockInput("BBCA")).toEqual({ symbol: "BBCA", exchange: "IDX", market: "IDX" });
    expect(parseStockInput("TLKM.JK")).toEqual({ symbol: "TLKM", exchange: "IDX", market: "IDX" });
    expect(parseStockInput("IDX:BBRI")).toEqual({ symbol: "BBRI", exchange: "IDX", market: "IDX" });
    expect(parseStockInput("AAPL")).toEqual({ symbol: "AAPL", market: "US" });
    expect(parseStockInput("NVDA")).toEqual({ symbol: "NVDA", market: "US" });
  });

  it("routes US stocks to Finnhub real-time first and IDX stocks to Twelve Data", async () => {
    const cache = new MemoryCacheService();

    const finnhubClient = {
      isConfigured: () => true,
      getQuote: vi.fn().mockResolvedValue({
        quote: { c: 231.45, d: 2.1, dp: 0.915, h: 233, l: 229, o: 230, pc: 229.35, t: 1794966500 },
        latencyMs: 45,
      }),
    } as unknown as FinnhubClient;

    const twelveDataClient = {
      isConfigured: () => true,
      getQuote: vi.fn().mockResolvedValue({
        quote: {
          symbol: "BBCA",
          name: "Bank Central Asia Tbk PT",
          exchange: "IDX",
          currency: "IDR",
          datetime: "2026-11-18 15:49:00",
          timestamp: 1794966500,
          open: "10025",
          high: "10150",
          low: "10000",
          close: "10100",
          volume: "65482100",
          previous_close: "10000",
          change: "100",
          percent_change: "1.00",
          is_market_open: true,
        },
        latencyMs: 70,
      }),
    } as unknown as TwelveDataClient;

    const avClient = { isConfigured: () => false } as unknown as AlphaVantageClient;

    const stockService = new StockService(
      new FinnhubProvider(cache, finnhubClient),
      new TwelveDataProvider(cache, twelveDataClient),
      new AlphaVantageProvider(cache, avClient),
    );

    const aapl = await stockService.lookupStock("AAPL");
    expect(aapl.ticker?.provider).toBe("finnhub");
    expect(aapl.ticker?.price).toBe("231.45");
    expect(aapl.ticker?.quoteCurrency).toBe("USD");
    expect(aapl.ticker?.sourceLabel).toContain("Finnhub");

    const bbca = await stockService.lookupStock("BBCA");
    expect(bbca.ticker?.provider).toBe("twelvedata");
    expect(bbca.ticker?.exchange).toBe("IDX");
    expect(bbca.ticker?.quoteCurrency).toBe("IDR");
    expect(bbca.ticker?.price).toBe("10100");
    expect(twelveDataClient.getQuote).toHaveBeenCalledWith("BBCA", "IDX");
  });

  it("converts FX using Frankfurter reference rates and rejects invalid amount or unsupported currency", async () => {
    const cache = new MemoryCacheService();
    const mockFx = {
      getCurrencies: vi.fn().mockResolvedValue({
        currencies: [
          { iso_code: "USD", name: "US Dollar" },
          { iso_code: "IDR", name: "Indonesian Rupiah" },
        ],
        latencyMs: 25,
      }),
      getRates: vi.fn().mockResolvedValue({
        rates: [{ date: "2026-11-18", base: "USD", quote: "IDR", rate: "18249" }],
        latencyMs: 30,
      }),
    } as unknown as FrankfurterClient;

    const fxService = new FxService(new FrankfurterProvider(cache, mockFx));
    const converted = await fxService.convert("100", "USD", "IDR");
    expect(converted.convertedAmount).toBe("1824900");
    expect(converted.referenceDate).toBe("2026-11-18");

    await expect(fxService.convert("-50", "USD", "IDR")).rejects.toThrow(ValidationError);
    await expect(fxService.convert("100", "USD", "XXX")).rejects.toThrow(ValidationError);
  });
});
