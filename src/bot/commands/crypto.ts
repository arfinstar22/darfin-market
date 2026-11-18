import { env } from "../../config/env.js";
import type { BotContext } from "../context.js";
import { formatCryptoDetailMessage } from "../formatters/messages.js";
import {
  buildAssetActionKeyboard,
  buildPopularCryptoKeyboard,
  buildSearchResultsKeyboard,
} from "../keyboards/market-menu.js";

export async function showCryptoPrice(ctx: BotContext, rawSymbol: string): Promise<void> {
  const symbol = rawSymbol.trim();
  if (!symbol || symbol.length > 60) {
    await ctx.reply("Pilih aset crypto atau ketik contoh: /crypto BTC", {
      reply_markup: buildPopularCryptoKeyboard(),
    });
    return;
  }

  const tz = ctx.dbUser?.timezone ?? env.APP_TIMEZONE;
  const res = await ctx.services.marketService.lookupCrypto(symbol);

  if (!res.indodaxTicker && !res.globalTicker && res.ambiguousCandidates.length > 0) {
    await ctx.reply(
      `Ditemukan beberapa aset dengan simbol ${res.query}. Pilih aset yang dimaksud:`,
      { reply_markup: buildSearchResultsKeyboard(res.ambiguousCandidates) },
    );
    return;
  }

  if (!res.indodaxTicker && !res.globalTicker) {
    await ctx.reply(
      res.indodaxError || res.globalError
        ? "Provider sedang tidak dapat dihubungi. Coba kembali beberapa saat lagi."
        : "Aset tidak ditemukan. Coba simbol atau nama lain, atau gunakan /search.",
    );
    return;
  }

  const lookupKey = res.globalTicker?.assetId ?? res.indodaxTicker?.symbol ?? res.query;
  const displaySym = res.indodaxTicker?.symbol ?? res.globalTicker?.symbol ?? res.query;
  await ctx.reply(formatCryptoDetailMessage(res, tz), {
    reply_markup: buildAssetActionKeyboard({
      assetClass: "crypto",
      lookupKey,
      symbol: displaySym,
    }),
  });
}

export async function handleCryptoCommand(ctx: BotContext): Promise<void> {
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  await showCryptoPrice(ctx, arg);
}
