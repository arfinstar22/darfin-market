import type { BotError } from "grammy";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import type { BotContext } from "../context.js";

export async function botErrorHandler(err: BotError<BotContext>): Promise<void> {
  const ctx = err.ctx;
  const error = err.error;

  logger.error(
    {
      updateId: ctx.update.update_id,
      userId: ctx.from?.id,
      errName: error instanceof Error ? error.name : "UnknownError",
      errMessage: error instanceof Error ? error.message : String(error),
    },
    "Bot handler error",
  );

  const userMessage =
    error instanceof AppError
      ? error.userMessage
      : "Terjadi kendala saat memproses permintaan. Silakan coba beberapa saat lagi.";

  try {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
    if (ctx.chat) {
      await ctx.reply(userMessage);
    }
  } catch (replyErr) {
    logger.warn(
      { err: replyErr instanceof Error ? replyErr.message : String(replyErr) },
      "Failed to deliver error message to Telegram user",
    );
  }
}
