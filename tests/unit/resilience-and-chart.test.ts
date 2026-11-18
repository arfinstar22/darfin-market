import { describe, expect, it } from "vitest";
import { renderChartPng } from "../../src/charts/renderer.js";
import { ProviderCircuitBreaker } from "../../src/utils/circuit-breaker.js";
import { QuotaExceededError } from "../../src/utils/errors.js";
import { MemoryQuotaStore, ProviderQuotaTracker } from "../../src/utils/quota.js";

describe("Circuit breaker, quota tracker, and local chart renderer", () => {
  it("transitions provider circuit breaker from healthy -> degraded -> down -> half-open -> healthy", () => {
    const cb = new ProviderCircuitBreaker(2, 4, 10_000);
    const t0 = 1_000_000;

    expect(cb.canExecute("indodax", t0)).toBe(true);
    cb.recordFailure("indodax", "503", t0);
    expect(cb.getSnapshot("indodax").state).toBe("healthy");

    cb.recordFailure("indodax", "503", t0 + 100);
    expect(cb.getSnapshot("indodax").state).toBe("degraded");

    cb.recordFailure("indodax", "503", t0 + 200);
    cb.recordFailure("indodax", "503", t0 + 300);
    expect(cb.getSnapshot("indodax").state).toBe("down");
    expect(cb.canExecute("indodax", t0 + 1000)).toBe(false);

    // After cooldown expires, probe is allowed
    expect(cb.canExecute("indodax", t0 + 11_000)).toBe(true);
    cb.recordSuccess("indodax", 45, t0 + 11_050);
    expect(cb.getSnapshot("indodax").state).toBe("healthy");
  });

  it("enforces quota warning tiers (70/85/95%) and blocks non-essential calls at >=85%", async () => {
    const tracker = new ProviderQuotaTracker(new MemoryQuotaStore());

    for (let i = 0; i < 8; i++) {
      await tracker.consume("coinpaprika", "monthly", 10, { isEssential: true });
    }
    const status80 = await tracker.getStatus("coinpaprika", "monthly", 10);
    expect(status80.level).toBe("warn_70");

    // 9th call -> 90%
    const status90 = await tracker.consume("coinpaprika", "monthly", 10, { isEssential: true });
    expect(status90.level).toBe("warn_85");

    // Non-essential call blocked at >=85%
    await expect(
      tracker.consume("coinpaprika", "monthly", 10, { isEssential: false }),
    ).rejects.toThrow(QuotaExceededError);

    // 10th essential call succeeds (100% -> critical_95), 11th rejected
    const status100 = await tracker.consume("coinpaprika", "monthly", 10, { isEssential: true });
    expect(status100.level).toBe("critical_95");
    await expect(
      tracker.consume("coinpaprika", "monthly", 10, { isEssential: true }),
    ).rejects.toThrow(QuotaExceededError);
  });

  it("renders a valid PNG chart locally without external services", () => {
    const png = renderChartPng({
      provider: "indodax",
      assetId: "btcidr",
      symbol: "BTC",
      quoteCurrency: "IDR",
      range: "7d",
      points: [
        { timestamp: "2026-11-11T00:00:00Z", price: "1120000000" },
        { timestamp: "2026-11-13T00:00:00Z", price: "1150000000" },
        { timestamp: "2026-11-15T00:00:00Z", price: "1140000000" },
        { timestamp: "2026-11-18T00:00:00Z", price: "1180000000" },
      ],
      sourceNote: "Data dikumpulkan DARFIN MARKET dari INDODAX mulai 2026-11-11",
      startedAt: "2026-11-11T00:00:00Z",
      endedAt: "2026-11-18T00:00:00Z",
    });

    // PNG magic header: 89 50 4E 47 0D 0A 1A 0A
    expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(png.byteLength).toBeGreaterThan(2000);
  });
});
