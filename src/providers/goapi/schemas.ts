import { z } from "zod";

const numStr = z.union([z.string(), z.number()]).transform((v) => String(v));

export const goApiPriceItemSchema = z
  .object({
    symbol: z.string().min(1),
    name: z.string().optional(),
    company: z
      .object({
        symbol: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),
    date: z.string().optional(),
    last_updated: z.string().optional(),
    price: numStr.optional(),
    open: numStr.optional(),
    high: numStr.optional(),
    low: numStr.optional(),
    close: numStr.optional(),
    previous_close: numStr.optional(),
    change: numStr.optional(),
    change_pct: numStr.optional(),
    percent_change: numStr.optional(),
    volume: numStr.optional(),
  })
  .passthrough();

export const goApiPricesResponseSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  data: z
    .object({
      results: z.array(goApiPriceItemSchema).default([]),
    })
    .optional(),
});

export const goApiHistoricalEntrySchema = z.object({
  date: z.string(),
  open: numStr,
  high: numStr,
  low: numStr,
  close: numStr,
  volume: numStr.optional(),
});

export const goApiHistoricalResponseSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  data: z
    .object({
      results: z.array(goApiHistoricalEntrySchema).optional(),
      prices: z.array(goApiHistoricalEntrySchema).optional(),
    })
    .optional(),
});

export const goApiCompaniesResponseSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  data: z
    .object({
      results: z
        .array(
          z.object({
            symbol: z.string().min(1),
            name: z.string().min(1),
          }),
        )
        .default([]),
    })
    .optional(),
});

export type GoApiPriceItem = z.infer<typeof goApiPriceItemSchema>;
