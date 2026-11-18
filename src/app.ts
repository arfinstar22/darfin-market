import { createTelegramBot } from "./bot/bot.js";
import { getValidHttpsWebAppUrl } from "./bot/commands/webapp.js";
import { env, getEffectiveWebAppPort } from "./config/env.js";
import { createAppContainer } from "./container.js";
import { runSqlMigrations } from "./db/client.js";
import { logger } from "./utils/logger.js";
import { startWebAppServer } from "./webapp/server.js";
import { startBackgroundWorkers, type RunningWorkers } from "./workers/runner.js";

async function main() {
  if (env.TELEGRAM_BOT_TOKEN === "replace_me" || env.TELEGRAM_BOT_TOKEN.includes("TEST_TOKEN")) {
    logger.error("TELEGRAM_BOT_TOKEN belum diisi dengan token valid dari BotFather di .env");
    process.exit(1);
  }

  const container = createAppContainer();
  await runSqlMigrations(container.pool);

  // Verify Frankfurter IDR catalog availability on startup (non-fatal)
  container.services.fxService
    .ensureIdrSupported()
    .then((supported) => {
      logger.info({ idrSupported: supported }, "Frankfurter currency catalog validated");
    })
    .catch((err) => {
      logger.warn({ err: String(err) }, "Initial Frankfurter catalog check failed");
    });

  // Start Telegram Mini App HTTP + SSE server (binds Render's PORT when present)
  const webAppServer = await startWebAppServer({
    services: container.services,
    botToken: env.TELEGRAM_BOT_TOKEN,
    host: env.WEBAPP_HOST,
    port: getEffectiveWebAppPort(),
  });

  // Optional single-service mode (ideal for Render.com Web Service)
  let embeddedWorkers: RunningWorkers | null = null;
  if (env.RUN_EMBEDDED_WORKER) {
    embeddedWorkers = await startBackgroundWorkers(container, env.TELEGRAM_BOT_TOKEN);
  }

  const bot = createTelegramBot(env.TELEGRAM_BOT_TOKEN, container.services);

  await bot.api
    .setMyCommands([
      { command: "start", description: "Buka DARFIN MARKET" },
      { command: "status", description: "Status layanan & provider" },
      { command: "delete_my_data", description: "Hapus data akun saya" },
    ])
    .catch((err) => {
      logger.warn({ err: String(err) }, "Could not register Telegram command menu");
    });

  // Configure Telegram Chat Menu Button (auto-uses WEBAPP_URL or Render's RENDER_EXTERNAL_URL)
  const webAppUrl = getValidHttpsWebAppUrl();
  if (webAppUrl) {
    await bot.api
      .setChatMenuButton({
        menu_button: {
          type: "web_app",
          text: "DARFIN MARKET",
          web_app: { url: webAppUrl },
        },
      })
      .then(() => logger.info({ webAppUrl }, "Telegram Mini App chat menu button configured"))
      .catch((err) => {
        logger.warn({ err: String(err) }, "Could not set Telegram Mini App chat menu button");
      });
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down DARFIN MARKET bot & Mini App server");
    await bot.stop();
    if (embeddedWorkers) {
      await embeddedWorkers.stop();
    }
    await new Promise<void>((resolve) => webAppServer.close(() => resolve()));
    await container.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  logger.info("Starting DARFIN MARKET Telegram bot (long polling)");
  await bot.start({
    onStart: (botInfo) => {
      logger.info({ username: botInfo.username }, "DARFIN MARKET bot is online");
    },
  });
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "Bot fatal error");
  process.exit(1);
});
