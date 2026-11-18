import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import type { BotContext } from "../context.js";
import { formatTopMoversMessage } from "../formatters/messages.js";

export async function showTopMovers(
  ctx: BotContext,
  direction: "gainers" | "losers",
): Promise<void> {
  const tz = ctx.dbUser?.timezone ?? env.APP_TIMEZONE;
  const items = await ctx.services.marketService.getTopMovers(direction, 10);
  if (items.length === 0) {
    await ctx.reply("Data top movers belum tersedia saat ini.");
    return;
  }

  const kb = new InlineKeyboard()
    .text(direction === "gainers" ? "📉 Lihat Top Losers" : "📈 Lihat Top Gainers", direction === "gainers" ? "menu:top_losers" : "menu:top_gainers")
    .text("⬅️ Menu Utama", "menu:home");

  await ctx.reply(formatTopMoversMessage(direction, items, tz), { reply_markup: kb });
}

export async function handleTopCommand(ctx: BotContext): Promise<void> {
  const arg = typeof ctx.match === "string" ? ctx.match.trim().toLowerCase() : "gainers";
  const direction = arg.startsWith("los") ? "losers" : "gainers";
  await showTopMovers(ctx, direction);
}
