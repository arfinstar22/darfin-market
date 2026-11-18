import type { BotContext } from "../context.js";
import { formatFxConversionMessage, formatFxRatesMessage } from "../formatters/messages.js";
import { buildFxQuickKeyboard } from "../keyboards/market-menu.js";

export async function showFxRates(ctx: BotContext, base = "USD"): Promise<void> {
  const summary = await ctx.services.fxService.getRatesSummary(base);
  if (summary.rates.length === 0) {
    await ctx.reply(`Kurs referensi untuk ${summary.base} belum tersedia.`);
    return;
  }
  await ctx.reply(formatFxRatesMessage(summary.base, summary.rates), {
    reply_markup: buildFxQuickKeyboard(),
  });
}

export async function handleFxCommand(ctx: BotContext): Promise<void> {
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  await showFxRates(ctx, arg || "USD");
}

export async function handleConvertCommand(ctx: BotContext): Promise<void> {
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const parts = arg.split(/\s+/).filter(Boolean);
  if (parts.length !== 3) {
    await ctx.reply(
      "Format konversi: /convert <jumlah> <dari> <ke>\nContoh:\n/convert 100 USD IDR\n/convert 50 EUR IDR\n/convert 250000 IDR USD",
    );
    return;
  }

  const [amount, from, to] = parts as [string, string, string];
  const result = await ctx.services.fxService.convert(amount, from, to);
  await ctx.reply(formatFxConversionMessage(result), {
    reply_markup: buildFxQuickKeyboard(),
  });
}
