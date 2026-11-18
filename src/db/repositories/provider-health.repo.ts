import type { ProviderHealthState, ProviderName } from "../../types/provider.js";
import type { AppDb } from "../client.js";
import { providerHealth, type ProviderHealthRow } from "../schema/index.js";

export interface UpsertProviderHealthInput {
  provider: ProviderName;
  status: Exclude<ProviderHealthState, "unconfigured">;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  lastErrorCode?: string;
  latencyMs?: number;
}

export class ProviderHealthRepository {
  constructor(private readonly db: AppDb) {}

  async upsert(input: UpsertProviderHealthInput): Promise<void> {
    const now = new Date();
    await this.db
      .insert(providerHealth)
      .values({
        provider: input.provider,
        status: input.status,
        lastSuccessAt: input.lastSuccessAt ?? null,
        lastErrorAt: input.lastErrorAt ?? null,
        lastErrorCode: input.lastErrorCode ?? null,
        latencyMs: input.latencyMs ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: providerHealth.provider,
        set: {
          status: input.status,
          ...(input.lastSuccessAt ? { lastSuccessAt: input.lastSuccessAt } : {}),
          ...(input.lastErrorAt ? { lastErrorAt: input.lastErrorAt } : {}),
          ...(input.lastErrorCode !== undefined ? { lastErrorCode: input.lastErrorCode } : {}),
          ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
          updatedAt: now,
        },
      });
  }

  async listAll(): Promise<ProviderHealthRow[]> {
    return this.db.select().from(providerHealth);
  }
}
