import { Decimal } from "decimal.js";
import { toDecimal } from "../../utils/decimal.js";

function formatWithSeparators(
  integerPart: string,
  fractionPart: string | undefined,
  thousandsSep: string,
  decimalSep: string,
): string {
  const negative = integerPart.startsWith("-");
  const digits = negative ? integerPart.slice(1) : integerPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
  const signed = negative ? `-${grouped}` : grouped;
  return fractionPart && fractionPart.length > 0 ? `${signed}${decimalSep}${fractionPart}` : signed;
}

function trimTrailingZeros(fraction: string, minDecimals = 0): string {
  let result = fraction;
  while (result.length > minDecimals && result.endsWith("0")) {
    result = result.slice(0, -1);
  }
  return result;
}

export function formatCurrencyAmount(value: string | number, currency: string): string {
  const curr = currency.toUpperCase();
  const dec = toDecimal(value);
  const abs = dec.abs();

  if (curr === "IDR") {
    const decimals = abs.gte(100) ? 0 : abs.gte(1) ? 2 : 4;
    const fixed = dec.toFixed(decimals);
    const [intPart, fracPart] = fixed.split(".");
    const cleanFrac = fracPart ? trimTrailingZeros(fracPart, 0) : undefined;
    return `Rp ${formatWithSeparators(intPart ?? "0", cleanFrac, ".", ",")}`;
  }

  const decimals = abs.gte(100) ? 2 : abs.gte(1) ? 2 : abs.gte(0.01) ? 4 : 6;
  const fixed = dec.toFixed(decimals);
  const [intPart, fracPart] = fixed.split(".");
  const cleanFrac = fracPart ? trimTrailingZeros(fracPart, abs.gte(1) ? 2 : 0) : undefined;
  const formatted = formatWithSeparators(intPart ?? "0", cleanFrac, ",", ".");

  if (curr === "USD") return `$${formatted}`;
  if (curr === "EUR") return `€${formatted}`;
  if (curr === "GBP") return `£${formatted}`;
  if (curr === "JPY") return `¥${formatWithSeparators(intPart ?? "0", undefined, ",", ".")}`;
  return `${formatted} ${curr}`;
}

export function formatCompactUsd(value: string | number): string {
  const dec = toDecimal(value);
  const abs = dec.abs();
  if (abs.gte("1000000000000")) {
    return `$${dec.div("1000000000000").toFixed(2)}T`;
  }
  if (abs.gte("1000000000")) {
    return `$${dec.div("1000000000").toFixed(2)}B`;
  }
  if (abs.gte("1000000")) {
    return `$${dec.div("1000000").toFixed(2)}M`;
  }
  return formatCurrencyAmount(dec.toFixed(), "USD");
}

export function formatPercent(value: string | number | undefined): string {
  if (value === undefined) return "N/A";
  const dec = toDecimal(value);
  const sign = dec.gt(0) ? "+" : "";
  return `${sign}${dec.toFixed(2)}%`;
}

export function formatVolume(value: string | number | undefined): string {
  if (value === undefined) return "N/A";
  const dec = new Decimal(value);
  const abs = dec.abs();
  if (abs.gte("1000000000")) return `${dec.div("1000000000").toFixed(2)}B`;
  if (abs.gte("1000000")) return `${dec.div("1000000").toFixed(2)}M`;
  if (abs.gte("1000")) return `${dec.div("1000").toFixed(2)}K`;
  return dec.toFixed(2);
}
