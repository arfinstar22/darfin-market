import { describe, expect, it } from "vitest";
import { evaluateAlertCrossing } from "../../src/services/alert.service.js";

describe("Alert threshold crossing state machine", () => {
  it("triggers ABOVE only when crossing from below target to at/above target", () => {
    const res = evaluateAlertCrossing({
      status: "active",
      condition: "above",
      targetPrice: "1500000000",
      lastObservedPrice: "1495000000",
      currentPrice: "1500000000",
      isStale: false,
    });
    expect(res).toEqual({ shouldTrigger: true, reason: "crossed_above" });
  });

  it("does NOT trigger ABOVE when already above target on previous poll (no spam)", () => {
    const res = evaluateAlertCrossing({
      status: "active",
      condition: "above",
      targetPrice: "1500000000",
      lastObservedPrice: "1510000000",
      currentPrice: "1520000000",
      isStale: false,
    });
    expect(res).toEqual({ shouldTrigger: false, reason: "already_on_target_side" });
  });

  it("triggers BELOW only when crossing from above target to at/below target", () => {
    const res = evaluateAlertCrossing({
      status: "active",
      condition: "below",
      targetPrice: "9500",
      lastObservedPrice: "9600",
      currentPrice: "9475",
      isStale: false,
    });
    expect(res).toEqual({ shouldTrigger: true, reason: "crossed_below" });
  });

  it("NEVER triggers when provider data is stale", () => {
    const res = evaluateAlertCrossing({
      status: "active",
      condition: "above",
      targetPrice: "100",
      lastObservedPrice: "90",
      currentPrice: "120",
      isStale: true,
    });
    expect(res).toEqual({ shouldTrigger: false, reason: "stale_data" });
  });

  it("records baseline instead of firing immediately when lastObservedPrice is null", () => {
    const res = evaluateAlertCrossing({
      status: "active",
      condition: "above",
      targetPrice: "100",
      lastObservedPrice: null,
      currentPrice: "120",
      isStale: false,
    });
    expect(res).toEqual({ shouldTrigger: false, reason: "baseline_recorded" });
  });

  it("never triggers non-active alerts (paused/triggered/deleted)", () => {
    for (const status of ["triggered", "paused", "deleted"]) {
      const res = evaluateAlertCrossing({
        status,
        condition: "above",
        targetPrice: "100",
        lastObservedPrice: "90",
        currentPrice: "120",
        isStale: false,
      });
      expect(res.shouldTrigger).toBe(false);
      expect(res.reason).toBe("not_active");
    }
  });
});
