import { Queue, type ConnectionOptions } from "bullmq";

export const QUEUE_NAMES = {
  ALERT_CHECK: "darfin-alert-check",
  MARKET_SNAPSHOT: "darfin-market-snapshot",
} as const;

export function getBullConnectionOptions(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  const useTls = parsed.protocol === "rediss:";
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    db: parsed.pathname && parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    tls: useTls ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function createQueues(redisUrl: string) {
  const connection = getBullConnectionOptions(redisUrl);
  const alertQueue = new Queue(QUEUE_NAMES.ALERT_CHECK, { connection });
  const snapshotQueue = new Queue(QUEUE_NAMES.MARKET_SNAPSHOT, { connection });
  return { alertQueue, snapshotQueue };
}
