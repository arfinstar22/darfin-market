import { z } from "zod";

export const frankfurterRateItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  base: z.string().min(2),
  quote: z.string().min(2),
  rate: z.union([z.number(), z.string()]).transform((v) => String(v)),
});

export const frankfurterRatesResponseSchema = z.array(frankfurterRateItemSchema);

export const frankfurterCurrencyItemSchema = z.object({
  iso_code: z.string().min(2),
  name: z.string().min(1),
  symbol: z.string().nullable().optional(),
  type: z.string().optional(),
});

export const frankfurterCurrenciesResponseSchema = z.array(frankfurterCurrencyItemSchema);
