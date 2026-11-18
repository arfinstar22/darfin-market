export type ProviderName =
  | "indodax"
  | "coinpaprika"
  | "frankfurter"
  | "finnhub"
  | "twelvedata"
  | "alphavantage"
  | "goapi";

export type ProviderHealthState = "healthy" | "degraded" | "down" | "unconfigured";

export interface ProviderStatus {
  provider: ProviderName;
  status: ProviderHealthState;
  configured: boolean;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastErrorCode?: string;
  latencyMs?: number;
  detail?: string;
}
