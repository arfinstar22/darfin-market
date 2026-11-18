import type { MiddlewareFn } from "grammy";
import { CacheKeys } from "../../cache/cache-keys.js";
import { env } from "../../config/env.js";
import type { BotContext } from "../context.js";

export function rateLimitMiddleware(): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) {
      await next();
      return;
    }

    const key = CacheKeys.userRateLimit(String(userId));
    const count = await ctx.services.cache.incrementRateLimit(key, 60);
    if (count > env.USER_COMMANDS_PER_MINUTE) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
          text: "Terlalu banyak permintaan. Coba lagi sebentar.",
          show_alert: true,
        });
      } else {
        await ctx.reply(
          "Batas permintaan sementara tercapai. Tunggu beberapa detik sebelum mencoba lagi.",
        );
      }
      return;
    }

    await next();
  };
}
