import { env } from "../../config/env.js";
import { ProviderError } from "../../utils/errors.js";
import { fetchJsonWithRetry } from "../../utils/http.js";
import {
  goApiCompaniesResponseSchema,
  goApiHistoricalResponseSchema,
  goApiPricesResponseSchema,
} from "./schemas.js";

export class GoApiClient {
  constructor(
    private readonly apiKey: string | undefined = env.GOAPI_API_KEY,
    private readonly baseUrl: string = env.GOAPI_BASE_URL,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new ProviderError(
        "goapi",
        "GOAPI_API_KEY not configured",
        401,
        false,
        "Provider saham Indonesia (GoAPI.io) belum dikonfigurasi.",
      );
    }
    return {
      "X-API-KEY": this.apiKey,
      Authorization: this.apiKey,
    };
  }

  private assertSuccess(status: string, message?: string): void {
    if (status.toLowerCase() !== "success") {
      throw new ProviderError("goapi", message ?? `GoAPI error: ${status}`, 400, false);
    }
  }

  async getPrices(symbols: string[]) {
    const clean = symbols
      .map((s) => s.trim().toUpperCase().replace(".JK", "").replace(":IDX", ""))
      .filter(Boolean);
    const params = new URLSearchParams({ symbols: clean.join(",") });
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/stock/idx/prices?${params.toString()}`,
      { provider: "goapi", headers: this.getHeaders() },
    );
    const parsed = goApiPricesResponseSchema.parse(data);
    this.assertSuccess(parsed.status, parsed.message);
    return { results: parsed.data?.results ?? [], latencyMs };
  }

  async getHistorical(symbol: string, fromDate: string, toDate: string) {
    const sym = encodeURIComponent(
      symbol.trim().toUpperCase().replace(".JK", "").replace(":IDX", ""),
    );
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/stock/idx/${sym}/historical?${params.toString()}`,
      { provider: "goapi", headers: this.getHeaders() },
    );
    const parsed = goApiHistoricalResponseSchema.parse(data);
    this.assertSuccess(parsed.status, parsed.message);
    const rows = parsed.data?.results ?? parsed.data?.prices ?? [];
    return { rows, latencyMs };
  }

  async getCompanies() {
    const { data, latencyMs } = await fetchJsonWithRetry(`${this.baseUrl}/stock/idx/companies`, {
      provider: "goapi",
      headers: this.getHeaders(),
    });
    const parsed = goApiCompaniesResponseSchema.parse(data);
    this.assertSuccess(parsed.status, parsed.message);
    return { companies: parsed.data?.results ?? [], latencyMs };
  }
}
