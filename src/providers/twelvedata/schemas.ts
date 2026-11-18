import { z } from "zod";

const numStr = z.union([z.string(), z.number()]).transform((v) => String(v));

export const twelveDataErrorSchema = z.object({
  status: z.literal("error"),
  code: z.number().optional(),
  message: z.string(),
});

export const twelveDataQuoteSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().optional(),
  exchange: z.string().optional(),
  mic_code: z.string().optional(),
  currency: z.string().optional(),
  datetime: z.string().optional(),
  timestamp: z.coerce.number().int().optional(),
  open: numStr.optional(),
  high: numStr.optional(),
  low: numStr.optional(),
  close: numStr,
  volume: numStr.optional(),
  previous_close: numStr.optional(),
  change: numStr.optional(),
  percent_change: numStr.optional(),
  is_market_open: z.boolean().optional(),
});

export const twelveDataSearchResponseSchema = z.object({
  data: z
    .array(
      z.object({
        symbol: z.string().min(1),
        instrument_name: z.string().min(1),
        exchange: z.string().optional(),
        mic_code: z.string().optional(),
        country: z.string().optional(),
        currency: z.string().optional(),
        instrument_type: z.string().optional(),
      }),
    )
    .default([]),
});

export const twelveDataTimeSeriesSchema = z.object({
  meta: z
    .object({
      symbol: z.string(),
      currency: z.string().optional(),
      exchange: z.string().optional(),
    })
    .optional(),
  values: z
    .array(
      z.object({
        datetime: z.string(),
        open: numStr,
        high: numStr,
        low: numStr,
        close: numStr,
        volume: numStr.optional(),
      }),
    )
    .default([]),
});
