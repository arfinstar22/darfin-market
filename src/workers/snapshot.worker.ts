import { POPULAR_INDODAX_PAIRS } from "../config/constants.js";
import { env } from "../config/env.js";
import type { AppContainer } from "../container.js";
import { logger } from "../utils/logger.js";

export async function captureIndodaxSnapshots(container: AppContainer): Promise<number> {
  const tickers = await container.services.marketService.getPopularIndodaxTickers(
    POPULAR_INDODAX_PAIRS,
  );
  const fresh = tickers.filter((t) => !t.isStale && !t.fromStaleCache);
  if (fresh.length === 0) {
    return 0;
  }

  const count = await container.repos.snapshots.insertMany(
    fresh.map((t) => ({
      provider: "indodax",
      assetId: t.assetId,
      symbol: t.symbol,
      marketPair: t.marketPair ?? null,
      quoteCurrency: t.quoteCurrency,
      price: t.price,
      observedAt: new Date(t.sourceUpdatedAt ?? t.fetchedAt),
    })),
  );

  // Sync provider health into PostgreSQL
  const statuses = [
    container.providers.indodax.getProviderStatus(),
    container.providers.coinpaprika.getProviderStatus(),
    container.providers.frankfurter.getProviderStatus(),
    container.providers.goapi.getProviderStatus(),
    container.providers.yahoo.getProviderStatus(),
    container.providers.finnhub.getProviderStatus(),
    container.providers.twelvedata.getProviderStatus(),
    container.providers.alphavantage.getProviderStatus(),
  ];

  for (const s of statuses) {
    if (!s.configured || s.status === "unconfigured") continue;
    await container.repos.providerHealth
      .upsert({
        provider: s.provider,
        status: s.status,
        lastSuccessAt: s.lastSuccessAt ? new Date(s.lastSuccessAt) : undefined,
        lastErrorAt: s.lastErrorAt ? new Date(s.lastErrorAt) : undefined,
        lastErrorCode: s.lastErrorCode,
        latencyMs: s.latencyMs,
      })
      .catch(() => undefined);
  }

  logger.info({ inserted: count }, "Captured INDODAX market snapshots");
  return count;
}

export async function pruneOldSnapshots(container: AppContainer): Promise<number> {
  const cutoff = new Date(Date.now() - env.SNAPSHOT_RETENTION_DAYS * 86_400_000);
  const deleted = await container.repos.snapshots.deleteOlderThan(cutoff);
  if (deleted > 0) {
    logger.info({ deleted, retentionDays: env.SNAPSHOT_RETENTION_DAYS }, "Pruned old snapshots");
  }
  return deleted;
}
