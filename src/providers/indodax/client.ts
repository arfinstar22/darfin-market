import { env } from "../../config/env.js";
import { fetchJsonWithRetry } from "../../utils/http.js";
import {
  indodaxPairsResponseSchema,
  indodaxSingleTickerResponseSchema,
  indodaxSummariesResponseSchema,
  indodaxTickerAllResponseSchema,
} from "./schemas.js";

export class IndodaxClient {
  constructor(private readonly baseUrl: string = env.INDODAX_BASE_URL) {}

  async getPairs() {
    const { data, latencyMs } = await fetchJsonWithRetry(`${this.baseUrl}/api/pairs`, {
      provider: "indodax",
    });
    return { pairs: indodaxPairsResponseSchema.parse(data), latencyMs };
  }

  async getTicker(pairId: string) {
    const cleanPair = pairId.toLowerCase().replace(/[^a-z0-9]/g, "");
    const { data, latencyMs } = await fetchJsonWithRetry(
      `${this.baseUrl}/api/ticker/${cleanPair}`,
      { provider: "indodax" },
    );
    return { ticker: indodaxSingleTickerResponseSchema.parse(data).ticker, latencyMs };
  }

  async getTickerAll() {
    const { data, latencyMs } = await fetchJsonWithRetry(`${this.baseUrl}/api/ticker_all`, {
      provider: "indodax",
    });
    return { tickers: indodaxTickerAllResponseSchema.parse(data).tickers, latencyMs };
  }

  async getSummaries() {
    const { data, latencyMs } = await fetchJsonWithRetry(`${this.baseUrl}/api/summaries`, {
      provider: "indodax",
    });
    return { summaries: indodaxSummariesResponseSchema.parse(data), latencyMs };
  }
}
