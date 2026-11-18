import { env } from "../../config/env.js";
import { ProviderError } from "../../utils/errors.js";
import { fetchJsonWithRetry } from "../../utils/http.js";
import {
  alphaVantageQuoteResponseSchema,
  alphaVantageSearchResponseSchema,
} from "./schemas.js";

export class AlphaVantageClient {
  constructor(
    private readonly apiKey: string | undefined = env.ALPHA_VANTAGE_API_KEY,
    private readonly baseUrl: string = env.ALPHA_VANTAGE_BASE_URL,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async getGlobalQuote(symbol: string) {
    if (!this.apiKey) {
      throw new ProviderError("alphavantage", "ALPHA_VANTAGE_API_KEY not configured", 401, false);
    }
    const params = new URLSearchParams({
      function: "GLOBAL_QUOTE",
      symbol: symbol.trim().toUpperCase(),
      apikey: this.apiKey,
    });
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/query?${params.toString()}`,
      { provider: "alphavantage" },
    );
    const parsed = alphaVantageQuoteResponseSchema.parse(data);
    if (parsed.Note || parsed.Information) {
      throw new ProviderError("alphavantage", parsed.Note ?? parsed.Information ?? "Rate limit", 429, false);
    }
    if (parsed["Error Message"]) {
      throw new ProviderError("alphavantage", parsed["Error Message"], 404, false);
    }
    return { quote: parsed["Global Quote"], latencyMs };
  }

  async searchSymbols(keywords: string) {
    if (!this.apiKey) {
      throw new ProviderError("alphavantage", "ALPHA_VANTAGE_API_KEY not configured", 401, false);
    }
    const params = new URLSearchParams({
      function: "SYMBOL_SEARCH",
      keywords: keywords.trim(),
      apikey: this.apiKey,
    });
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/query?${params.toString()}`,
      { provider: "alphavantage" },
    );
    const parsed = alphaVantageSearchResponseSchema.parse(data);
    if (parsed.Note || parsed.Information) {
      throw new ProviderError("alphavantage", parsed.Note ?? parsed.Information ?? "Rate limit", 429, false);
    }
    return { matches: parsed.bestMatches ?? [], latencyMs };
  }
}
