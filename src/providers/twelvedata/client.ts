import { env } from "../../config/env.js";
import { ProviderError } from "../../utils/errors.js";
import { fetchJsonWithRetry } from "../../utils/http.js";
import {
  twelveDataErrorSchema,
  twelveDataQuoteSchema,
  twelveDataSearchResponseSchema,
  twelveDataTimeSeriesSchema,
} from "./schemas.js";

export class TwelveDataClient {
  constructor(
    private readonly apiKey: string | undefined = env.TWELVE_DATA_API_KEY,
    private readonly baseUrl: string = env.TWELVE_DATA_BASE_URL,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new ProviderError(
        "twelvedata",
        "TWELVE_DATA_API_KEY not configured",
        401,
        false,
        "Provider saham IDX/Global (Twelve Data) belum dikonfigurasi.",
      );
    }
    return { Authorization: `apikey ${this.apiKey}` };
  }

  private assertNotApiError(data: unknown): void {
    const parsedErr = twelveDataErrorSchema.safeParse(data);
    if (parsedErr.success) {
      const code = parsedErr.data.code ?? 400;
      const lower = parsedErr.data.message.toLowerCase();
      if (lower.includes("plan") || lower.includes("upgrade")) {
        throw new ProviderError(
          "twelvedata",
          parsedErr.data.message,
          403,
          false,
          "Simbol bursa ini tidak termasuk di paket Twelve Data saat ini (IDX memerlukan plan Pro atau provider IDX terpisah).",
        );
      }
      if (code === 404 || lower.includes("not found")) {
        throw new ProviderError("twelvedata", parsedErr.data.message, 404, false);
      }
      throw new ProviderError("twelvedata", parsedErr.data.message, code, code === 429);
    }
  }

  async getQuote(symbol: string, exchange?: string) {
    const params = new URLSearchParams({ symbol: symbol.trim().toUpperCase() });
    if (exchange) {
      params.set("exchange", exchange.trim().toUpperCase());
    }
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/quote?${params.toString()}`,
      { provider: "twelvedata", headers: this.getHeaders() },
    );
    this.assertNotApiError(data);
    return { quote: twelveDataQuoteSchema.parse(data), latencyMs };
  }

  async search(query: string) {
    const params = new URLSearchParams({ symbol: query.trim() });
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/symbol_search?${params.toString()}`,
      { provider: "twelvedata", headers: this.getHeaders() },
    );
    this.assertNotApiError(data);
    return { results: twelveDataSearchResponseSchema.parse(data).data, latencyMs };
  }

  async getTimeSeries(symbol: string, interval: string, outputsize: number, exchange?: string) {
    const params = new URLSearchParams({
      symbol: symbol.trim().toUpperCase(),
      interval,
      outputsize: String(outputsize),
    });
    if (exchange) {
      params.set("exchange", exchange.trim().toUpperCase());
    }
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/time_series?${params.toString()}`,
      { provider: "twelvedata", headers: this.getHeaders() },
    );
    this.assertNotApiError(data);
    return { series: twelveDataTimeSeriesSchema.parse(data), latencyMs };
  }
}
