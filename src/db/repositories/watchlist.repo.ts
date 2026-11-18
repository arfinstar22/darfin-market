import { and, asc, count, eq } from "drizzle-orm";
import type { AppDb } from "../client.js";
import { watchlistItems, type WatchlistItemRow } from "../schema/index.js";

export interface AddWatchlistInput {
  userId: string;
  assetClass: "crypto" | "stock";
  assetId: string;
  symbol: string;
  name?: string | null;
  provider: string;
  marketPair?: string | null;
  quoteCurrency: string;
}

export class WatchlistRepository {
  constructor(private readonly db: AppDb) {}

  async listByUser(userId: string): Promise<WatchlistItemRow[]> {
    return this.db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.userId, userId))
      .orderBy(asc(watchlistItems.createdAt));
  }

  async countByUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(watchlistItems)
      .where(eq(watchlistItems.userId, userId));
    return Number(rows[0]?.total ?? 0);
  }

  async add(input: AddWatchlistInput): Promise<{ item: WatchlistItemRow; created: boolean }> {
    const inserted = await this.db
      .insert(watchlistItems)
      .values({
        userId: input.userId,
        assetClass: input.assetClass,
        assetId: input.assetId,
        symbol: input.symbol.toUpperCase(),
        name: input.name ?? null,
        provider: input.provider,
        marketPair: input.marketPair ?? null,
        quoteCurrency: input.quoteCurrency.toUpperCase(),
      })
      .onConflictDoNothing()
      .returning();

    if (inserted[0]) {
      return { item: inserted[0], created: true };
    }

    const existing = await this.db
      .select()
      .from(watchlistItems)
      .where(
        and(
          eq(watchlistItems.userId, input.userId),
          eq(watchlistItems.provider, input.provider),
          eq(watchlistItems.assetId, input.assetId),
          eq(watchlistItems.quoteCurrency, input.quoteCurrency.toUpperCase()),
        ),
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error("Failed to resolve watchlist item");
    }
    return { item: existing[0], created: false };
  }

  async removeBySymbol(userId: string, symbol: string): Promise<number> {
    const deleted = await this.db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.symbol, symbol.toUpperCase())))
      .returning({ id: watchlistItems.id });
    return deleted.length;
  }

  async removeById(userId: string, itemId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.id, itemId)))
      .returning({ id: watchlistItems.id });
    return deleted.length > 0;
  }
}
