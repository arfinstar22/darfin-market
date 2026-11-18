import { env } from "../../config/env.js";
import type { BotContext } from "../context.js";
import { formatMarketOverviewMessage } from "../formatters/messages.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.js";

export async function handleMarket(ctx: BotContext): Promise<void> {
  const tz = ctx.dbUser?.timezone ?? env.APP_TIMEZONE;
  const overview = await ctx.services.marketService.getMarketOverview();
  await ctx.reply(formatMarketOverviewMessage(overview, tz), {
    reply_markup: buildMainMenuKeyboard(),
  });
}
