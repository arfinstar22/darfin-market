import { z } from "zod";

export const finnhubQuoteSchema = z.object({
  c: z.number(), // current price
  d: z.number().nullable().optional(), // change
  dp: z.number().nullable().optional(), // percent change
  h: z.number().nullable().optional(), // high
  l: z.number().nullable().optional(), // low
  o: z.number().nullable().optional(), // open
  pc: z.number().nullable().optional(), // previous close
  t: z.number().int(), // unix timestamp seconds
});

export const finnhubSearchSchema = z.object({
  count: z.number().int(),
  result: z.array(
    z.object({
      description: z.string(),
      displaySymbol: z.string(),
      symbol: z.string(),
      type: z.string().optional(),
    }),
  ),
});
