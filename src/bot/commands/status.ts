import { env } from "../../config/env.js";
import type { BotContext } from "../context.js";
import { formatSystemStatusMessage } from "../formatters/messages.js";

export async function handleStatusCommand(ctx: BotContext): Promise<void> {
  const tz = ctx.dbUser?.timezone ?? env.APP_TIMEZONE;
  const status = await ctx.services.healthService.getSystemStatus();
  await ctx.reply(formatSystemStatusMessage(status, tz));
}
