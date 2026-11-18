import { describe, expect, it } from "vitest";
import {
  formatCompactUsd,
  formatCurrencyAmount,
  formatPercent,
} from "../../src/bot/formatters/number.js";
import {
  calculatePercentChange,
  compareDecimals,
  isValidPositiveDecimal,
  multiplyDecimals,
} from "../../src/utils/decimal.js";
import { sanitizeUrlForLog } from "../../src/utils/logger.js";

describe("Decimal arithmetic & formatting", () => {
  it("multiplies decimals without floating point drift", () => {
    expect(multiplyDecimals("0.1", "0.2")).toBe("0.02");
    expect(multiplyDecimals("100", "18249")).toBe("1824900");
    expect(multiplyDecimals("250000", "0.00005479752315195353")).toBe("13.6993807879883825");
  });

  it("calculates percent change accurately and guards zero previous price", () => {
    expect(calculatePercentChange("110", "100")).toBe("10.0000");
    expect(calculatePercentChange("90", "100")).toBe("-10.0000");
    expect(calculatePercentChange("100", "0")).toBeUndefined();
    expect(calculatePercentChange("100", "-5")).toBeUndefined();
  });

  it("validates positive decimals and compares large numbers", () => {
    expect(isValidPositiveDecimal("1500000000")).toBe(true);
    expect(isValidPositiveDecimal("0")).toBe(false);
    expect(isValidPositiveDecimal("-10")).toBe(false);
    expect(isValidPositiveDecimal("abc")).toBe(false);
    expect(compareDecimals("1180432000", "1180431999.999999999")).toBe(1);
  });

  it("formats IDR using Indonesian thousand separators and USD cleanly", () => {
    expect(formatCurrencyAmount("1180432000", "IDR")).toBe("Rp 1.180.432.000");
    expect(formatCurrencyAmount("64413.588", "USD")).toBe("$64,413.59");
    expect(formatCompactUsd("2294149097495")).toBe("$2.29T");
    expect(formatPercent("2.456")).toBe("+2.46%");
    expect(formatPercent("-1.2")).toBe("-1.20%");
  });

  it("redacts API keys and tokens from logged URLs", () => {
    const raw = "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=SECRET123";
    expect(sanitizeUrlForLog(raw)).not.toContain("SECRET123");
    expect(sanitizeUrlForLog(raw)).toContain("apikey=REDACTED");
  });
});
