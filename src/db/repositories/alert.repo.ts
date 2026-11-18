import { and, count, desc, eq, ne } from "drizzle-orm";
import type { AlertCondition, AlertStatus } from "../../types/alert.js";
import type { ProviderName } from "../../types/provider.js";
import type { AppDb } from "../client.js";
import { priceAlerts, users, type PriceAlertRow } from "../schema/index.js";

export interface CreateAlertInput {
  userId: string;
  assetId: string;
  symbol: string;
  provider: ProviderName;
  marketPair?: string | null;
  quoteCurrency: string;
  condition: AlertCondition;
  targetPrice: string;
  initialObservedPrice?: string | null;
}

export interface ActiveAlertWithUser extends PriceAlertRow {
  telegramUserId: bigint;
  userTimezone: string;
}

export class AlertRepository {
  constructor(private readonly db: AppDb) {}

  async create(input: CreateAlertInput): Promise<PriceAlertRow> {
    const now = new Date();
    const rows = await this.db
      .insert(priceAlerts)
      .values({
        userId: input.userId,
        assetId: input.assetId,
        symbol: input.symbol.toUpperCase(),
        provider: input.provider,
        marketPair: input.marketPair ?? null,
        quoteCurrency: input.quoteCurrency.toUpperCase(),
        condition: input.condition,
        targetPrice: input.targetPrice,
        status: "active",
        lastObservedPrice: input.initialObservedPrice ?? null,
        lastObservedAt: input.initialObservedPrice ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!rows[0]) {
      throw new Error("Failed to create price alert");
    }
    return rows[0];
  }

  async countActiveByUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(priceAlerts)
      .where(and(eq(priceAlerts.userId, userId), eq(priceAlerts.status, "active")));
    return Number(rows[0]?.total ?? 0);
  }

  async listByUser(userId: string): Promise<PriceAlertRow[]> {
    return this.db
      .select()
      .from(priceAlerts)
      .where(and(eq(priceAlerts.userId, userId), ne(priceAlerts.status, "deleted")))
      .orderBy(desc(priceAlerts.createdAt));
  }

  async listActiveByProvider(provider: ProviderName): Promise<ActiveAlertWithUser[]> {
    const rows = await this.db
      .select({
        alert: priceAlerts,
        telegramUserId: users.telegramUserId,
        userTimezone: users.timezone,
      })
      .from(priceAlerts)
      .innerJoin(users, eq(priceAlerts.userId, users.id))
      .where(and(eq(priceAlerts.status, "active"), eq(priceAlerts.provider, provider)));

    return rows.map((row) => ({
      ...row.alert,
      telegramUserId: row.telegramUserId,
      userTimezone: row.userTimezone,
    }));
  }

  async updateObservation(alertId: string, observedPrice: string, observedAt: Date): Promise<void> {
    await this.db
      .update(priceAlerts)
      .set({
        lastObservedPrice: observedPrice,
        lastObservedAt: observedAt,
        updatedAt: new Date(),
      })
      .where(eq(priceAlerts.id, alertId));
  }

  async markTriggered(alertId: string, observedPrice: string, observedAt: Date): Promise<boolean> {
    const updated = await this.db
      .update(priceAlerts)
      .set({
        status: "triggered",
        lastObservedPrice: observedPrice,
        lastObservedAt: observedAt,
        triggeredAt: observedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(priceAlerts.id, alertId), eq(priceAlerts.status, "active")))
      .returning({ id: priceAlerts.id });
    return updated.length > 0;
  }

  async updateStatus(userId: string, alertIdPrefix: string, status: AlertStatus): Promise<PriceAlertRow | null> {
    const userAlerts = await this.listByUser(userId);
    const match = userAlerts.find((a) => a.id === alertIdPrefix || a.id.startsWith(alertIdPrefix));
    if (!match) {
      return null;
    }

    const updated = await this.db
      .update(priceAlerts)
      .set({
        status,
        ...(status === "active" ? { triggeredAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(priceAlerts.id, match.id), eq(priceAlerts.userId, userId)))
      .returning();

    return updated[0] ?? null;
  }
}
