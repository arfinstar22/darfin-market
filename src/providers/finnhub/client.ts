import { env } from "../../config/env.js";
import { ProviderError } from "../../utils/errors.js";
import { fetchJsonWithRetry } from "../../utils/http.js";
import { finnhubQuoteSchema, finnhubSearchSchema } from "./schemas.js";

export class FinnhubClient {
  constructor(
    private readonly apiKey: string | undefined = env.FINNHUB_API_KEY,
    private readonly baseUrl: string = env.FINNHUB_BASE_URL,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new ProviderError(
        "finnhub",
        "FINNHUB_API_KEY not configured",
        401,
        false,
        "Provider saham US (Finnhub) belum dikonfigurasi.",
      );
    }
    return { "X-Finnhub-Token": this.apiKey };
  }

  async getQuote(symbol: string) {
    const params = new URLSearchParams({ symbol: symbol.trim().toUpperCase() });
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/quote?${params.toString()}`,
      { provider: "finnhub", headers: this.getHeaders() },
    );
    return { quote: finnhubQuoteSchema.parse(data), latencyMs };
  }

  async search(query: string) {
    const params = new URLSearchParams({ q: query.trim() });
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/search?${params.toString()}`,
      { provider: "finnhub", headers: this.getHeaders() },
    );
    return { results: finnhubSearchSchema.parse(data).result, latencyMs };
  }
}
