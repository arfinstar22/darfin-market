import type { ProviderName } from "../types/provider.js";
import { logger } from "./logger.js";
import { QuotaExceededError } from "./errors.js";

export interface QuotaStore {
  increment(key: string, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
}

export class MemoryQuotaStore implements QuotaStore {
  private readonly counts = new Map<string, { value: number; expiresAt: number }>();

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const existing = this.counts.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.counts.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    existing.value += 1;
    return existing.value;
  }

  async get(key: string): Promise<number> {
    const existing = this.counts.get(key);
    if (!existing || existing.expiresAt <= Date.now()) {
      return 0;
    }
    return existing.value;
  }
}

export interface QuotaStatus {
  provider: ProviderName;
  period: "daily" | "monthly";
  used: number;
  limit: number;
  percent: number;
  level: "ok" | "warn_70" | "warn_85" | "critical_95";
}

function getBucketKey(provider: ProviderName, period: "daily" | "monthly", now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const suffix = period === "monthly" ? `${year}-${month}` : `${year}-${month}-${day}`;
  return `quota:${provider}:${period}:${suffix}`;
}

export class ProviderQuotaTracker {
  constructor(private store: QuotaStore = new MemoryQuotaStore()) {}

  setStore(store: QuotaStore): void {
    this.store = store;
  }

  async consume(
    provider: ProviderName,
    period: "daily" | "monthly",
    limit: number,
    options?: { allowNonEssential?: boolean; isEssential?: boolean },
  ): Promise<QuotaStatus> {
    const key = getBucketKey(provider, period);
    const current = await this.store.get(key);
    const currentPct = (current / limit) * 100;

    if (current >= limit) {
      throw new QuotaExceededError(provider, period);
    }

    if (options?.isEssential === false && currentPct >= 85) {
      throw new QuotaExceededError(provider, period);
    }

    const ttl = period === "monthly" ? 35 * 86400 : 2 * 86400;
    const used = await this.store.increment(key, ttl);
    const status = this.computeStatus(provider, period, used, limit);

    if (status.level === "critical_95") {
      logger.error({ provider, used, limit, percent: status.percent }, "Provider quota >= 95%");
    } else if (status.level === "warn_85") {
      logger.warn({ provider, used, limit, percent: status.percent }, "Provider quota >= 85%");
    } else if (status.level === "warn_70" && used === Math.ceil(limit * 0.7)) {
      logger.warn({ provider, used, limit, percent: status.percent }, "Provider quota >= 70%");
    }

    return status;
  }

  async getStatus(provider: ProviderName, period: "daily" | "monthly", limit: number): Promise<QuotaStatus> {
    const key = getBucketKey(provider, period);
    const used = await this.store.get(key);
    return this.computeStatus(provider, period, used, limit);
  }

  private computeStatus(
    provider: ProviderName,
    period: "daily" | "monthly",
    used: number,
    limit: number,
  ): QuotaStatus {
    const percent = Math.round((used / limit) * 1000) / 10;
    let level: QuotaStatus["level"] = "ok";
    if (percent >= 95) level = "critical_95";
    else if (percent >= 85) level = "warn_85";
    else if (percent >= 70) level = "warn_70";

    return { provider, period, used, limit, percent, level };
  }
}

export const quotaTracker = new ProviderQuotaTracker();
