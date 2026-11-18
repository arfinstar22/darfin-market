import { Decimal } from "decimal.js";

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

export function toDecimal(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) {
    if (!value.isFinite()) {
      throw new Error("Non-finite decimal value");
    }
    return value;
  }
  const normalized = typeof value === "string" ? value.trim() : value;
  const dec = new Decimal(normalized);
  if (!dec.isFinite()) {
    throw new Error(`Invalid numeric value: ${String(value)}`);
  }
  return dec;
}

export function isValidPositiveDecimal(value: string | number): boolean {
  try {
    const dec = toDecimal(value);
    return dec.gt(0);
  } catch {
    return false;
  }
}

export function toDecimalString(value: string | number | Decimal): string {
  return toDecimal(value).toFixed();
}

export function multiplyDecimals(a: string | number, b: string | number): string {
  return toDecimal(a).mul(toDecimal(b)).toFixed();
}

export function divideDecimals(a: string | number, b: string | number): string {
  const divisor = toDecimal(b);
  if (divisor.isZero()) {
    throw new Error("Division by zero");
  }
  return toDecimal(a).div(divisor).toFixed();
}

export function calculatePercentChange(
  currentPrice: string | number,
  previousPrice: string | number,
): string | undefined {
  try {
    const curr = toDecimal(currentPrice);
    const prev = toDecimal(previousPrice);
    if (prev.lte(0)) {
      return undefined;
    }
    return curr.minus(prev).div(prev).mul(100).toFixed(4);
  } catch {
    return undefined;
  }
}

export function compareDecimals(a: string | number, b: string | number): -1 | 0 | 1 {
  const cmp = toDecimal(a).cmp(toDecimal(b));
  return cmp < 0 ? -1 : cmp > 0 ? 1 : 0;
}
