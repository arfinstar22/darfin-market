import { z } from "zod";

const numericStringSchema = z.union([z.string(), z.number()]).transform((v) => String(v));

export const indodaxPairSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  base_currency: z.string().min(1),
  traded_currency: z.string().min(1),
  traded_currency_unit: z.string().min(1),
  description: z.string().min(1),
  ticker_id: z.string().min(1),
  is_maintenance: z.union([z.number(), z.boolean()]).optional().default(0),
  is_market_suspended: z.union([z.number(), z.boolean()]).optional().default(0),
});

export const indodaxPairsResponseSchema = z.array(indodaxPairSchema);

export const indodaxTickerEntrySchema = z
  .object({
    high: numericStringSchema,
    low: numericStringSchema,
    buy: numericStringSchema,
    sell: numericStringSchema,
    last: numericStringSchema,
    server_time: z.coerce.number().int().positive(),
    name: z.string().optional(),
  })
  .passthrough();

export const indodaxSingleTickerResponseSchema = z.object({
  ticker: indodaxTickerEntrySchema,
});

export const indodaxTickerAllResponseSchema = z.object({
  tickers: z.record(z.string(), indodaxTickerEntrySchema),
});

export const indodaxSummariesResponseSchema = z.object({
  tickers: z.record(z.string(), indodaxTickerEntrySchema),
  prices_24h: z.record(z.string(), numericStringSchema).optional(),
  prices_7d: z.record(z.string(), numericStringSchema).optional(),
});

export type IndodaxTickerEntry = z.infer<typeof indodaxTickerEntrySchema>;
