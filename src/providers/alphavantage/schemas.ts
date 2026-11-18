import { z } from "zod";

export const alphaVantageQuoteResponseSchema = z.object({
  "Global Quote": z
    .object({
      "01. symbol": z.string().optional(),
      "02. open": z.string().optional(),
      "03. high": z.string().optional(),
      "04. low": z.string().optional(),
      "05. price": z.string().optional(),
      "06. volume": z.string().optional(),
      "07. latest trading day": z.string().optional(),
      "08. previous close": z.string().optional(),
      "09. change": z.string().optional(),
      "10. change percent": z.string().optional(),
    })
    .optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});

export const alphaVantageSearchResponseSchema = z.object({
  bestMatches: z
    .array(
      z.object({
        "1. symbol": z.string(),
        "2. name": z.string(),
        "4. region": z.string().optional(),
        "8. currency": z.string().optional(),
      }),
    )
    .optional(),
  Note: z.string().optional(),
  Information: z.string().optional(),
});
