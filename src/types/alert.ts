import type { ProviderName } from "./provider.js";

export type AlertCondition = "above" | "below";
export type AlertStatus = "active" | "triggered" | "paused" | "deleted";

export interface PriceAlertRecord {
  id: string;
  userId: string;
  telegramUserId?: bigint;
  assetId: string;
  symbol: string;
  provider: ProviderName;
  marketPair: string | null;
  quoteCurrency: string;
  condition: AlertCondition;
  targetPrice: string; // Decimal string
  status: AlertStatus;
  lastObservedPrice: string | null;
  lastObservedAt: Date | null;
  triggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertEvaluationResult {
  shouldTrigger: boolean;
  reason:
    | "crossed_above"
    | "crossed_below"
    | "not_active"
    | "stale_data"
    | "invalid_price"
    | "baseline_recorded"
    | "already_on_target_side"
    | "not_crossed";
}
