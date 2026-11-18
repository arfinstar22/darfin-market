import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { ProviderName } from "../../types/provider.js";
import type { AppDb } from "../client.js";
import { marketSnapshots, type MarketSnapshotRow } from "../schema/index.js";

export interface SnapshotInsert {
  provider: ProviderName;
  assetId: string;
  symbol: string;
  marketPair?: string | null;
  quoteCurrency: string;
  price: string;
  observedAt?: Date;
}

export class SnapshotRepository {
  constructor(private readonly db: AppDb) {}

  async insertMany(items: SnapshotInsert[]): Promise<number> {
    if (items.length === 0) return 0;
    const now = new Date();
    const inserted = await this.db
      .insert(marketSnapshots)
      .values(
        items.map((item) => ({
          provider: item.provider,
          assetId: item.assetId,
          symbol: item.symbol.toUpperCase(),
          marketPair: item.marketPair ?? null,
          quoteCurrency: item.quoteCurrency.toUpperCase(),
          price: item.price,
          observedAt: item.observedAt ?? now,
        })),
      )
      .returning({ id: marketSnapshots.id });
    return inserted.length;
  }

  async getSeries(
    provider: ProviderName,
    assetId: string,
    quoteCurrency: string,
    since: Date,
  ): Promise<MarketSnapshotRow[]> {
    return this.db
      .select()
      .from(marketSnapshots)
      .where(
        and(
          eq(marketSnapshots.provider, provider),
          eq(marketSnapshots.assetId, assetId),
          eq(marketSnapshots.quoteCurrency, quoteCurrency.toUpperCase()),
          gte(marketSnapshots.observedAt, since),
        ),
      )
      .orderBy(asc(marketSnapshots.observedAt));
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(marketSnapshots)
      .where(lt(marketSnapshots.observedAt, cutoff))
      .returning({ id: marketSnapshots.id });
    return deleted.length;
  }
}
