import type { MiddlewareFn } from "grammy";
import { logger } from "../../utils/logger.js";
import type { BotContext } from "../context.js";

export function userRegistrationMiddleware(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const from = ctx.from;
    if (from) {
      try {
        ctx.dbUser = await ctx.services.userRepo.upsertTelegramUser({
          telegramUserId: BigInt(from.id),
          username: from.username ?? null,
          firstName: from.first_name ?? null,
          language: from.language_code ?? null,
        });
      } catch (error) {
        logger.error(
          { telegramUserId: from.id, err: error instanceof Error ? error.message : String(error) },
          "Failed to register/update user",
        );
      }
    }
    await next();
  };
}
