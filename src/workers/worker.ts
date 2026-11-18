import { env } from "../config/env.js";
import { createAppContainer } from "../container.js";
import { runSqlMigrations } from "../db/client.js";
import { logger } from "../utils/logger.js";
import { startBackgroundWorkers } from "./runner.js";

async function main() {
  const container = createAppContainer();
  await runSqlMigrations(container.pool);

  const workers = await startBackgroundWorkers(container, env.TELEGRAM_BOT_TOKEN);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down DARFIN MARKET worker");
    await workers.stop();
    await container.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "Worker fatal error");
  process.exit(1);
});
