import { Bot } from "grammy";
import { handleHelp } from "./commands/help.js";
import { handleDeleteMyDataCommand } from "./commands/settings.js";
import { handleStart } from "./commands/start.js";
import { handleStatusCommand } from "./commands/status.js";
import { handleWebAppCommand } from "./commands/webapp.js";
import type { AppServices, BotContext } from "./context.js";
import { buildMainMenuKeyboard } from "./keyboards/main-menu.js";
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

  // Minimalist Mini-App-first command set
  bot.command("start", handleStart);
  bot.command("webapp", handleWebAppCommand);
  bot.command("dashboard", handleWebAppCommand);
  bot.command("help", handleHelp);
  bot.command("status", handleStatusCommand);
  bot.command("delete_my_data", handleDeleteMyDataCommand);

  bot.callbackQuery("menu:home", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleStart(ctx);
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

  // Any other text message gently points directly to the single Mini App launcher button
  bot.on("message:text", async (ctx) => {
    const kb = buildMainMenuKeyboard();
    await ctx.reply(
      "Semua fitur DARFIN MARKET tersedia di Mini App. Tekan tombol di bawah untuk membukanya:",
      kb ? { reply_markup: kb } : undefined,
    );
  });

  bot.catch(botErrorHandler);
  return bot;
}
