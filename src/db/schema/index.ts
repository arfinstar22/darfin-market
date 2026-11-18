import {
  bigint,
  bigserial,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    telegramUserId: bigint("telegram_user_id", { mode: "bigint" }).notNull(),
    username: text("username"),
    firstName: text("first_name"),
    timezone: text("timezone").notNull().default("Asia/Makassar"),
    language: text("language").notNull().default("id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_telegram_user_id_idx").on(table.telegramUserId)],
);

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assetClass: text("asset_class").notNull().default("crypto"), // crypto | stock
    assetId: text("asset_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name"),
    provider: text("provider").notNull(), // indodax | coinpaprika | finnhub | twelvedata | alphavantage
    marketPair: text("market_pair"),
    quoteCurrency: text("quote_currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("watchlist_user_provider_asset_quote_idx").on(
      table.userId,
      table.provider,
      table.assetId,
      table.quoteCurrency,
    ),
    index("watchlist_user_id_idx").on(table.userId),
  ],
);

export const priceAlerts = pgTable(
  "price_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assetId: text("asset_id").notNull(),
    symbol: text("symbol").notNull(),
    provider: text("provider").notNull(),
    marketPair: text("market_pair"),
    quoteCurrency: text("quote_currency").notNull(),
    condition: text("condition").notNull(), // above | below
    targetPrice: numeric("target_price", { precision: 38, scale: 18 }).notNull(),
    status: text("status").notNull().default("active"), // active | triggered | paused | deleted
    lastObservedPrice: numeric("last_observed_price", { precision: 38, scale: 18 }),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("price_alerts_status_provider_symbol_idx").on(table.status, table.provider, table.symbol),
    index("price_alerts_user_status_idx").on(table.userId, table.status),
  ],
);

export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    provider: text("provider").notNull(),
    assetId: text("asset_id").notNull(),
    symbol: text("symbol").notNull(),
    marketPair: text("market_pair"),
    quoteCurrency: text("quote_currency").notNull(),
    price: numeric("price", { precision: 38, scale: 18 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("market_snapshots_lookup_idx").on(
      table.provider,
      table.assetId,
      table.quoteCurrency,
      table.observedAt,
    ),
  ],
);

export const providerHealth = pgTable("provider_health", {
  provider: text("provider").primaryKey(),
  status: text("status").notNull().default("healthy"), // healthy | degraded | down
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  latencyMs: integer("latency_ms"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type WatchlistItemRow = typeof watchlistItems.$inferSelect;
export type PriceAlertRow = typeof priceAlerts.$inferSelect;
export type MarketSnapshotRow = typeof marketSnapshots.$inferSelect;
export type ProviderHealthRow = typeof providerHealth.$inferSelect;
