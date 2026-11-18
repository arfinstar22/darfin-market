import { describe, expect, it } from "vitest";
import { MemoryCacheService } from "../../src/cache/redis.js";
import { CoinPaprikaProvider } from "../../src/providers/coinpaprika/provider.js";
import { FrankfurterProvider } from "../../src/providers/frankfurter/provider.js";
import { IndodaxProvider } from "../../src/providers/indodax/provider.js";
import { FxService } from "../../src/services/fx.service.js";
import { MarketService } from "../../src/services/market.service.js";

describe("Live public provider schema verification (INDODAX, CoinPaprika, Frankfurter)", () => {
  it("parses real live INDODAX, CoinPaprika, and Frankfurter payloads cleanly", async () => {
    const cache = new MemoryCacheService();
    const indodax = new IndodaxProvider(cache);
    const coinpaprika = new CoinPaprikaProvider(cache);
    const frankfurter = new FrankfurterProvider(cache);

    const market = new MarketService(indodax, coinpaprika, frankfurter);
    const fx = new FxService(frankfurter);

    const overview = await market.getMarketOverview();
    expect(overview.indodaxTickers.length).toBeGreaterThan(0);
    expect(overview.indodaxTickers[0]?.provider).toBe("indodax");
    expect(overview.indodaxTickers[0]?.quoteCurrency).toBe("IDR");
    expect(Number(overview.indodaxTickers[0]?.price)).toBeGreaterThan(0);

    expect(overview.globalStats).not.toBeNull();
    expect(Number(overview.globalStats?.marketCapUsd)).toBeGreaterThan(0);

    const btc = await market.lookupCrypto("BTC");
    expect(btc.indodaxTicker?.symbol).toBe("BTC");
    expect(btc.globalTicker?.symbol).toBe("BTC");

    // Frankfurter might occasionally have slow IPv6 DNS on some networks; verify when reachable
    if (overview.usdIdrRate) {
      expect(overview.usdIdrRate.base).toBe("USD");
      expect(overview.usdIdrRate.quote).toBe("IDR");
      expect(Number(overview.usdIdrRate.rate)).toBeGreaterThan(1000);

      const conv = await fx.convert("100", "USD", "IDR");
      expect(Number(conv.convertedAmount)).toBeGreaterThan(100_000);
    }
  }, 30_000);
});
