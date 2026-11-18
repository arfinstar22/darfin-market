import { Worker } from "bullmq";
import { Api } from "grammy";
import { env } from "../config/env.js";
import type { AppContainer } from "../container.js";
import type { ProviderName } from "../types/provider.js";
import { logger } from "../utils/logger.js";
import { processAlertsForProvider } from "./alert-check.worker.js";
import { createQueues, getBullConnectionOptions, QUEUE_NAMES } from "./queues.js";
import { captureIndodaxSnapshots, pruneOldSnapshots } from "./snapshot.worker.js";

export interface RunningWorkers {
  mode: "bullmq" | "interval";
  stop(): Promise<void>;
}

/**
 * Starts background alert & snapshot workers.
 * - Uses BullMQ + Redis when REDIS_URL is configured (Docker VPS / Upstash / Render Key Value).
 * - Falls back to lightweight in-process interval timers when REDIS_URL is omitted (single-service Render free tier).
 */
export async function startBackgroundWorkers(
  container: AppContainer,
  botToken: string = env.TELEGRAM_BOT_TOKEN,
): Promise<RunningWorkers> {
  const telegramApi = new Api(botToken);

  if (env.REDIS_URL) {
    const connection = getBullConnectionOptions(env.REDIS_URL);
    const { alertQueue, snapshotQueue } = createQueues(env.REDIS_URL);

    await alertQueue.upsertJobScheduler(
      "alert-indodax",
      { every: env.INDODAX_ALERT_INTERVAL_SECONDS * 1000 },
      { name: "check-provider", data: { provider: "indodax" satisfies ProviderName } },
    );

    await alertQueue.upsertJobScheduler(
      "alert-coinpaprika",
      { every: env.COINPAPRIKA_ALERT_INTERVAL_SECONDS * 1000 },
      { name: "check-provider", data: { provider: "coinpaprika" satisfies ProviderName } },
    );

    if (container.providers.goapi.isConfigured()) {
      await alertQueue.upsertJobScheduler(
        "alert-goapi",
        { every: env.STOCK_ALERT_INTERVAL_SECONDS * 1000 },
        { name: "check-provider", data: { provider: "goapi" satisfies ProviderName } },
      );
    }

    await alertQueue.upsertJobScheduler(
      "alert-yahoo",
      { every: env.STOCK_ALERT_INTERVAL_SECONDS * 1000 },
      { name: "check-provider", data: { provider: "yahoo" satisfies ProviderName } },
    );

    if (container.providers.finnhub.isConfigured()) {
      await alertQueue.upsertJobScheduler(
        "alert-finnhub",
        { every: env.STOCK_ALERT_INTERVAL_SECONDS * 1000 },
        { name: "check-provider", data: { provider: "finnhub" satisfies ProviderName } },
      );
    }

    if (container.providers.twelvedata.isConfigured()) {
      await alertQueue.upsertJobScheduler(
        "alert-twelvedata",
        { every: Math.max(env.STOCK_ALERT_INTERVAL_SECONDS, 180) * 1000 },
        { name: "check-provider", data: { provider: "twelvedata" satisfies ProviderName } },
      );
    }

    await snapshotQueue.upsertJobScheduler(
      "snapshot-indodax",
      { every: env.SNAPSHOT_INTERVAL_SECONDS * 1000 },
      { name: "capture-indodax", data: {} },
    );

    await snapshotQueue.upsertJobScheduler(
      "snapshot-prune",
      { every: 24 * 3600 * 1000 },
      { name: "prune-snapshots", data: {} },
    );

    const alertWorker = new Worker<{ provider: ProviderName }>(
      QUEUE_NAMES.ALERT_CHECK,
      async (job) => processAlertsForProvider(container, telegramApi, job.data.provider),
      { connection, concurrency: 2 },
    );

    const snapshotWorker = new Worker(
      QUEUE_NAMES.MARKET_SNAPSHOT,
      async (job) => {
        if (job.name === "prune-snapshots") return pruneOldSnapshots(container);
        return captureIndodaxSnapshots(container);
      },
      { connection, concurrency: 1 },
    );

    alertWorker.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, err: err.message }, "Alert worker job failed");
    });

    snapshotWorker.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, err: err.message }, "Snapshot worker job failed");
    });

    logger.info("Background workers started (BullMQ + Redis mode)");

    return {
      mode: "bullmq",
      async stop() {
        await Promise.allSettled([
          alertWorker.close(),
          snapshotWorker.close(),
          alertQueue.close(),
          snapshotQueue.close(),
        ]);
      },
    };
  }

  // ponytail: In-process interval scheduler for single-instance Render free tier without Redis.
  // Ceiling: single replica only; upgrade by setting REDIS_URL to switch automatically to BullMQ.
  const timers: NodeJS.Timeout[] = [];
  const runSafe = (name: string, fn: () => Promise<unknown>) => {
    fn().catch((err) => {
      logger.warn({ job: name, err: err instanceof Error ? err.message : String(err) }, "Interval job failed");
    });
  };

  timers.push(
    setInterval(
      () => runSafe("alert-indodax", () => processAlertsForProvider(container, telegramApi, "indodax")),
      env.INDODAX_ALERT_INTERVAL_SECONDS * 1000,
    ),
  );
  timers.push(
    setInterval(
      () => runSafe("alert-coinpaprika", () => processAlertsForProvider(container, telegramApi, "coinpaprika")),
      env.COINPAPRIKA_ALERT_INTERVAL_SECONDS * 1000,
    ),
  );

  if (container.providers.goapi.isConfigured()) {
    timers.push(
      setInterval(
        () => runSafe("alert-goapi", () => processAlertsForProvider(container, telegramApi, "goapi")),
        env.STOCK_ALERT_INTERVAL_SECONDS * 1000,
      ),
    );
  }

  timers.push(
    setInterval(
      () => runSafe("alert-yahoo", () => processAlertsForProvider(container, telegramApi, "yahoo")),
      env.STOCK_ALERT_INTERVAL_SECONDS * 1000,
    ),
  );

  if (container.providers.finnhub.isConfigured()) {
    timers.push(
      setInterval(
        () => runSafe("alert-finnhub", () => processAlertsForProvider(container, telegramApi, "finnhub")),
        env.STOCK_ALERT_INTERVAL_SECONDS * 1000,
      ),
    );
  }

  if (container.providers.twelvedata.isConfigured()) {
    timers.push(
      setInterval(
        () => runSafe("alert-twelvedata", () => processAlertsForProvider(container, telegramApi, "twelvedata")),
        Math.max(env.STOCK_ALERT_INTERVAL_SECONDS, 180) * 1000,
      ),
    );
  }

  timers.push(
    setInterval(
      () => runSafe("snapshot-indodax", () => captureIndodaxSnapshots(container)),
      env.SNAPSHOT_INTERVAL_SECONDS * 1000,
    ),
  );
  timers.push(
    setInterval(
      () => runSafe("snapshot-prune", () => pruneOldSnapshots(container)),
      24 * 3600 * 1000,
    ),
  );

  logger.info("Background workers started (in-process interval mode, no Redis)");

  return {
    mode: "interval",
    async stop() {
      for (const t of timers) clearInterval(t);
    },
  };
}
