import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import type { BotContext } from "../context.js";
import { formatWatchlistMessage } from "../formatters/messages.js";

export async function showWatchlist(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) {
    await ctx.reply("Profil pengguna tidak tersedia. Jalankan /start terlebih dahulu.");
    return;
  }

  const tz = ctx.dbUser.timezone ?? env.APP_TIMEZONE;
  const items = await ctx.services.watchlistService.getWatchlistWithPrices(ctx.dbUser.id);
  const kb = new InlineKeyboard();
  for (const item of items.slice(0, 8)) {
    kb.text(`❌ ${item.row.symbol}`, `watchrm:${item.row.id}`);
    kb.text(
      `🔎 ${item.row.symbol}`,
      item.row.assetClass === "stock" ? `stock:${item.row.assetId}` : `crypto:${item.row.assetId}`,
    ).row();
  }
  kb.text("🔄 Refresh", "menu:watchlist").text("⬅️ Menu Utama", "menu:home");

  await ctx.reply(formatWatchlistMessage(items, tz), { reply_markup: kb });
}

export async function handleWatchAddCommand(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) {
    await ctx.reply("Jalankan /start terlebih dahulu.");
    return;
  }
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!arg) {
    await ctx.reply("Format: /watchadd <SIMBOL>\nContoh: /watchadd BTC, /watchadd BBCA, /watchadd AAPL");
    return;
  }

  const { item, created } = await ctx.services.watchlistService.addByInput(ctx.dbUser.id, arg);
  await ctx.reply(
    created
      ? `⭐ ${item.symbol}/${item.quoteCurrency} (${item.provider.toUpperCase()}) ditambahkan ke watchlist.`
      : `${item.symbol}/${item.quoteCurrency} sudah ada di watchlist kamu.`,
  );
}

export async function handleWatchRemoveCommand(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) {
    await ctx.reply("Jalankan /start terlebih dahulu.");
    return;
  }
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!arg) {
    await ctx.reply("Format: /watchremove <SIMBOL>\nContoh: /watchremove BTC");
    return;
  }

  const removed = await ctx.services.watchlistService.removeBySymbol(ctx.dbUser.id, arg);
  await ctx.reply(
    removed > 0
      ? `🗑️ ${arg.toUpperCase()} dihapus dari watchlist.`
      : `${arg.toUpperCase()} tidak ditemukan di watchlist kamu.`,
  );
}
