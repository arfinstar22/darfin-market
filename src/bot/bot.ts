import { Bot } from "grammy";
import {
  handleAlertCommand,
  handleAlertPauseCommand,
  handleAlertRemoveCommand,
  handleAlertResumeCommand,
  showAlerts,
} from "./commands/alert.js";
import { handleChartCommand, sendChart } from "./commands/chart.js";
import { handleCryptoCommand, showCryptoPrice } from "./commands/crypto.js";
import { handleConvertCommand, handleFxCommand, showFxRates } from "./commands/fx.js";
import { handleHelp } from "./commands/help.js";
import { handleMarket } from "./commands/market.js";
import { handleSearchCommand } from "./commands/search.js";
import {
  handleDeleteMyDataCommand,
  showSettings,
  updateTimezone,
} from "./commands/settings.js";
import { handleStart } from "./commands/start.js";
import { handleStatusCommand } from "./commands/status.js";
import {
  handleStockCommand,
  handleStockSearchCommand,
  handleStocksListCommand,
  showPopularIdxStocks,
  showPopularUsStocks,
  showStockPrice,
} from "./commands/stock.js";
import { handleTopCommand, showTopMovers } from "./commands/top.js";
import { handleWebAppCommand } from "./commands/webapp.js";
import {
  handleWatchAddCommand,
  handleWatchRemoveCommand,
  showWatchlist,
} from "./commands/watchlist.js";
import type { AppServices, BotContext } from "./context.js";
import { buildPopularCryptoKeyboard } from "./keyboards/market-menu.js";
import { botErrorHandler } from "./middleware/error-handler.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { userRegistrationMiddleware } from "./middleware/user-registration.js";

export function createTelegramBot(token: string, services: AppServices): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  bot.use(async (ctx, next) => {
    ctx.services = services;
    await next();
  });
  bot.use(rateLimitMiddleware());
  bot.use(userRegistrationMiddleware());

  // Core commands
  bot.command("start", handleStart);
  bot.command("webapp", handleWebAppCommand);
  bot.command("dashboard", handleWebAppCommand);
  bot.command("help", handleHelp);
  bot.command("market", handleMarket);
  bot.command("crypto", handleCryptoCommand);
  bot.command("stock", handleStockCommand);
  bot.command("stocks", handleStocksListCommand);
  bot.command("stocksearch", handleStockSearchCommand);
  bot.command("search", handleSearchCommand);
  bot.command("top", handleTopCommand);
  bot.command("fx", handleFxCommand);
  bot.command("convert", handleConvertCommand);
  bot.command("chart", handleChartCommand);
  bot.command("watchlist", showWatchlist);
  bot.command("watchadd", handleWatchAddCommand);
  bot.command("watchremove", handleWatchRemoveCommand);
  bot.command("alert", handleAlertCommand);
  bot.command("alerts", showAlerts);
  bot.command("alertremove", handleAlertRemoveCommand);
  bot.command("alertpause", handleAlertPauseCommand);
  bot.command("alertresume", handleAlertResumeCommand);
  bot.command("settings", showSettings);
  bot.command("delete_my_data", handleDeleteMyDataCommand);
  bot.command("status", handleStatusCommand);

  // Inline keyboard callbacks
  bot.callbackQuery("menu:home", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleStart(ctx);
  });

  bot.callbackQuery("menu:market", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleMarket(ctx);
  });

  bot.callbackQuery("menu:crypto", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("🪙 Pilih aset crypto populer atau ketik /crypto <SIMBOL>:", {
      reply_markup: buildPopularCryptoKeyboard(),
    });
  });

  bot.callbackQuery("menu:stocks_idx", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPopularIdxStocks(ctx);
  });

  bot.callbackQuery("menu:stocks_us", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPopularUsStocks(ctx);
  });

  bot.callbackQuery("menu:top_gainers", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showTopMovers(ctx, "gainers");
  });

  bot.callbackQuery("menu:top_losers", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showTopMovers(ctx, "losers");
  });

  bot.callbackQuery("menu:fx", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showFxRates(ctx, "USD");
  });

  bot.callbackQuery("menu:watchlist", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWatchlist(ctx);
  });

  bot.callbackQuery("menu:alerts", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAlerts(ctx);
  });

  bot.callbackQuery("menu:settings", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSettings(ctx);
  });

  bot.callbackQuery(/^crypto:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const target = ctx.match[1] ?? "";
    await showCryptoPrice(ctx, target);
  });

  bot.callbackQuery(/^stock:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const target = ctx.match[1] ?? "";
    await showStockPrice(ctx, target);
  });

  bot.callbackQuery(/^fx:([A-Z]{3,5})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showFxRates(ctx, ctx.match[1] ?? "USD");
  });

  bot.callbackQuery(/^chart:([^:]+(?::IDX|:US)?):(1d|7d|30d|90d)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Menyiapkan grafik..." });
    await sendChart(ctx, ctx.match[1] ?? "", ctx.match[2]);
  });

  bot.callbackQuery(/^watchadd:(crypto|stock):(.+)$/, async (ctx) => {
    if (!ctx.dbUser) {
      await ctx.answerCallbackQuery({ text: "Jalankan /start dahulu." });
      return;
    }
    const mode = ctx.match[1] as "crypto" | "stock";
    const symbol = ctx.match[2] ?? "";
    const { item, created } = await ctx.services.watchlistService.addByInput(
      ctx.dbUser.id,
      symbol,
      mode,
    );
    await ctx.answerCallbackQuery({
      text: created
        ? `${item.symbol} ditambahkan ke watchlist!`
        : `${item.symbol} sudah ada di watchlist.`,
    });
  });

  bot.callbackQuery(/^watchrm:(.+)$/, async (ctx) => {
    if (!ctx.dbUser) return;
    const removed = await ctx.services.watchlistService.removeById(
      ctx.dbUser.id,
      ctx.match[1] ?? "",
    );
    await ctx.answerCallbackQuery({ text: removed ? "Dihapus dari watchlist" : "Item tidak ditemukan" });
    await showWatchlist(ctx);
  });

  bot.callbackQuery(/^alertpause:(.+)$/, async (ctx) => {
    if (!ctx.dbUser) return;
    const res = await ctx.services.alertService.pauseAlert(ctx.dbUser.id, ctx.match[1] ?? "");
    await ctx.answerCallbackQuery({ text: res ? "Alert dijeda" : "Alert tidak ditemukan" });
    await showAlerts(ctx);
  });

  bot.callbackQuery(/^alertresume:(.+)$/, async (ctx) => {
    if (!ctx.dbUser) return;
    const res = await ctx.services.alertService.resumeAlert(ctx.dbUser.id, ctx.match[1] ?? "");
    await ctx.answerCallbackQuery({ text: res ? "Alert diaktifkan" : "Alert tidak ditemukan" });
    await showAlerts(ctx);
  });

  bot.callbackQuery(/^alertdel:(.+)$/, async (ctx) => {
    if (!ctx.dbUser) return;
    const res = await ctx.services.alertService.deleteAlert(ctx.dbUser.id, ctx.match[1] ?? "");
    await ctx.answerCallbackQuery({ text: res ? "Alert dihapus" : "Alert tidak ditemukan" });
    await showAlerts(ctx);
  });

  bot.callbackQuery(/^tz:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await updateTimezone(ctx, ctx.match[1] ?? "");
  });

  bot.callbackQuery("confirm_delete_data", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.from) return;
    const deleted = await ctx.services.userRepo.deleteUserData(BigInt(ctx.from.id));
    await ctx.reply(
      deleted
        ? "🗑️ Seluruh data akun, watchlist, dan alert kamu telah dihapus."
        : "Tidak ada data yang tersimpan untuk akunmu.",
    );
  });

  bot.catch(botErrorHandler);
  return bot;
}
