import { z } from "zod";

export const coinPaprikaGlobalSchema = z.object({
  market_cap_usd: z.number(),
  volume_24h_usd: z.number(),
  bitcoin_dominance_percentage: z.number(),
  cryptocurrencies_number: z.number().int(),
  market_cap_change_24h: z.number().optional(),
  last_updated: z.number().int().positive(),
});

export const coinPaprikaQuoteUsdSchema = z.object({
  price: z.number(),
  volume_24h: z.number().nullable().optional(),
  market_cap: z.number().nullable().optional(),
  percent_change_24h: z.number().nullable().optional(),
  percent_change_7d: z.number().nullable().optional(),
  ath_price: z.number().nullable().optional(),
});

export const coinPaprikaTickerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().min(1),
  rank: z.number().int().nullable().optional(),
  last_updated: z.string().optional(),
  quotes: z.object({
    USD: coinPaprikaQuoteUsdSchema,
  }),
});

export const coinPaprikaTickersResponseSchema = z.array(coinPaprikaTickerSchema);

export const coinPaprikaSearchResponseSchema = z.object({
  currencies: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        symbol: z.string().min(1),
        rank: z.number().int().nullable().optional(),
        is_active: z.boolean().optional(),
      }),
    )
    .default([]),
});

export const coinPaprikaOhlcvEntrySchema = z.object({
  time_open: z.string(),
  time_close: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
});

export const coinPaprikaOhlcvResponseSchema = z.array(coinPaprikaOhlcvEntrySchema);

export type CoinPaprikaTickerRaw = z.infer<typeof coinPaprikaTickerSchema>;
