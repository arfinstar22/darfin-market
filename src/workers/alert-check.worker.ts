import { Api } from "grammy";
import { formatTriggeredAlertNotification } from "../bot/formatters/messages.js";
import type { AppContainer } from "../container.js";
import type { ActiveAlertWithUser } from "../db/repositories/alert.repo.js";
import { evaluateAlertCrossing } from "../services/alert.service.js";
import type { MarketTicker } from "../types/market.js";
import type { ProviderName } from "../types/provider.js";
import { logger } from "../utils/logger.js";

async function sendTelegramNotificationSafe(
  api: Api,
  telegramUserId: bigint,
  text: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await api.sendMessage(Number(telegramUserId), text);
      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(
        { telegramUserId: String(telegramUserId), attempt, err: errMsg },
        "Failed to send Telegram alert message",
      );
      // Do not retry if user blocked the bot (403)
      if (errMsg.includes("403") || errMsg.toLowerCase().includes("blocked")) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  return false;
}

export async function processAlertsForProvider(
  container: AppContainer,
  telegramApi: Api,
  provider: ProviderName,
): Promise<{ checked: number; triggered: number }> {
  const activeAlerts = await container.repos.alerts.listActiveByProvider(provider);
  if (activeAlerts.length === 0) {
    return { checked: 0, triggered: 0 };
  }

  const tickerMap = await fetchTickersForProviderBatch(container, provider, activeAlerts);
  let triggeredCount = 0;

  for (const alert of activeAlerts) {
    const ticker = tickerMap.get(alert.assetId.toLowerCase());
    if (!ticker) continue;

    const evaluation = evaluateAlertCrossing({
      status: alert.status,
      condition: alert.condition as "above" | "below",
      targetPrice: alert.targetPrice,
      lastObservedPrice: alert.lastObservedPrice,
      currentPrice: ticker.price,
      isStale: ticker.isStale || Boolean(ticker.fromStaleCache),
    });

    const observedAt = new Date(ticker.sourceUpdatedAt ?? ticker.fetchedAt);

    if (evaluation.shouldTrigger) {
      const transitioned = await container.repos.alerts.markTriggered(
        alert.id,
        ticker.price,
        observedAt,
      );
      if (transitioned) {
        triggeredCount += 1;
        const message = formatTriggeredAlertNotification({
          symbol: alert.symbol,
          quoteCurrency: alert.quoteCurrency,
          condition: alert.condition as "above" | "below",
          observedPrice: ticker.price,
          targetPrice: alert.targetPrice,
          sourceLabel: ticker.sourceLabel,
          observedAt: observedAt.toISOString(),
          timezone: alert.userTimezone,
        });
        await sendTelegramNotificationSafe(telegramApi, alert.telegramUserId, message);
      }
    } else if (evaluation.reason !== "stale_data" && evaluation.reason !== "invalid_price") {
      await container.repos.alerts.updateObservation(alert.id, ticker.price, observedAt);
    }
  }

  logger.info(
    { provider, checked: activeAlerts.length, triggered: triggeredCount },
    "Alert check cycle completed",
  );
  return { checked: activeAlerts.length, triggered: triggeredCount };
}

async function fetchTickersForProviderBatch(
  container: AppContainer,
  provider: ProviderName,
  alerts: ActiveAlertWithUser[],
): Promise<Map<string, MarketTicker>> {
  const map = new Map<string, MarketTicker>();

  try {
    if (provider === "indodax") {
      const all = await container.providers.indodax.getAllTickers();
      for (const t of all) {
        map.set(t.assetId.toLowerCase(), t);
      }
      return map;
    }

    if (provider === "coinpaprika") {
      const uniqueIds = Array.from(new Set(alerts.map((a) => a.assetId)));
      for (const coinId of uniqueIds) {
        const ticker = await container.providers.coinpaprika.getTickerByCoinId(coinId);
        if (ticker) map.set(coinId.toLowerCase(), ticker);
      }
      return map;
    }

    if (provider === "goapi") {
      const uniqueSyms = Array.from(new Set(alerts.map((a) => a.symbol)));
      const batch = await container.providers.goapi.getBatchQuotes(uniqueSyms);
      for (const ticker of batch.values()) {
        map.set(ticker.assetId.toLowerCase(), ticker);
      }
      return map;
    }

    if (provider === "yahoo") {
      const uniqueSyms = Array.from(new Set(alerts.map((a) => a.symbol)));
      const batch = await container.providers.yahoo.getBatchIdxQuotes(uniqueSyms);
      for (const ticker of batch.values()) {
        map.set(ticker.assetId.toLowerCase(), ticker);
      }
      return map;
    }

    // Stock providers — deduplicate unique assets per batch
    const uniqueAssets = Array.from(
      new Map(alerts.map((a) => [a.assetId.toLowerCase(), a])).values(),
    );

    for (const item of uniqueAssets) {
      const stockRes = await container.services.stockService.lookupStock(item.assetId);
      if (stockRes.ticker) {
        map.set(item.assetId.toLowerCase(), stockRes.ticker);
      }
    }
  } catch (error) {
    logger.warn(
      { provider, err: error instanceof Error ? error.message : String(error) },
      "Batch ticker fetch failed during alert check",
    );
  }

  return map;
}
