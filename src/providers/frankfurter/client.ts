import { env } from "../../config/env.js";
import { fetchJsonWithRetry } from "../../utils/http.js";
import {
  frankfurterCurrenciesResponseSchema,
  frankfurterRatesResponseSchema,
} from "./schemas.js";

export class FrankfurterClient {
  constructor(private readonly baseUrl: string = env.FRANKFURTER_BASE_URL) {}

  async getCurrencies() {
    const { data, latencyMs } = await fetchJsonWithRetry(`${this.baseUrl}/currencies`, {
      provider: "frankfurter",
    });
    return { currencies: frankfurterCurrenciesResponseSchema.parse(data), latencyMs };
  }

  async getRates(base: string, quotes?: string[]) {
    const params = new URLSearchParams({ base: base.toUpperCase() });
    if (quotes && quotes.length > 0) {
      params.set(
        "quotes",
        quotes.map((q) => q.toUpperCase()).join(","),
      );
    }
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/rates?${params.toString()}`,
      { provider: "frankfurter" },
    );
    return { rates: frankfurterRatesResponseSchema.parse(data), latencyMs };
  }
}
