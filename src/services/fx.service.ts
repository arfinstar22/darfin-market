import { POPULAR_FX_QUOTES } from "../config/constants.js";
import type { FrankfurterProvider } from "../providers/frankfurter/provider.js";
import type { FxRate } from "../types/market.js";
import { isValidPositiveDecimal, multiplyDecimals } from "../utils/decimal.js";
import { ValidationError } from "../utils/errors.js";

export interface FxConversionResult {
  amount: string;
  base: string;
  quote: string;
  rate: string;
  convertedAmount: string;
  referenceDate: string;
  fetchedAt: string;
  fromStaleCache?: boolean;
}

export class FxService {
  constructor(private readonly frankfurter: FrankfurterProvider) {}

  async ensureIdrSupported(): Promise<boolean> {
    return this.frankfurter.hasCurrency("IDR");
  }

  async getRatesSummary(base = "USD"): Promise<{ base: string; rates: FxRate[] }> {
    const cleanBase = base.trim().toUpperCase();
    if (!/^[A-Z]{3,5}$/.test(cleanBase)) {
      throw new ValidationError("Kode mata uang tidak valid. Contoh: /fx USD");
    }

    const supported = await this.frankfurter.hasCurrency(cleanBase);
    if (!supported) {
      throw new ValidationError(`Kurs referensi untuk mata uang ${cleanBase} belum tersedia.`);
    }

    const quotes = POPULAR_FX_QUOTES.filter((q) => q !== cleanBase);
    const rates = await this.frankfurter.getRates(cleanBase, [...quotes]);
    return { base: cleanBase, rates };
  }

  async convert(amountRaw: string, fromRaw: string, toRaw: string): Promise<FxConversionResult> {
    const normalizedAmount = amountRaw.trim().replace(",", ".");
    if (!isValidPositiveDecimal(normalizedAmount)) {
      throw new ValidationError("Nominal konversi harus berupa angka positif. Contoh: /convert 100 USD IDR");
    }

    const base = fromRaw.trim().toUpperCase();
    const quote = toRaw.trim().toUpperCase();
    if (!/^[A-Z]{3,5}$/.test(base) || !/^[A-Z]{3,5}$/.test(quote)) {
      throw new ValidationError("Kode mata uang tidak valid. Contoh: /convert 100 USD IDR");
    }

    const [hasBase, hasQuote] = await Promise.all([
      this.frankfurter.hasCurrency(base),
      this.frankfurter.hasCurrency(quote),
    ]);

    if (!hasBase) {
      throw new ValidationError(`Kurs referensi untuk mata uang ${base} belum tersedia.`);
    }
    if (!hasQuote) {
      throw new ValidationError(`Kurs referensi untuk mata uang ${quote} belum tersedia.`);
    }

    const rateData = await this.frankfurter.getRate(base, quote);
    if (!rateData) {
      throw new ValidationError(`Kurs referensi ${base}/${quote} belum tersedia saat ini.`);
    }

    const convertedAmount = multiplyDecimals(normalizedAmount, rateData.rate);
    return {
      amount: normalizedAmount,
      base,
      quote,
      rate: rateData.rate,
      convertedAmount,
      referenceDate: rateData.referenceDate,
      fetchedAt: rateData.fetchedAt,
      fromStaleCache: rateData.fromStaleCache,
    };
  }
}
