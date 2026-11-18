import type { BotContext } from "../context.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.js";

export async function handleStart(ctx: BotContext): Promise<void> {
  const name = ctx.from?.first_name ? `, ${ctx.from.first_name}` : "";
  const message = [
    `👋 Selamat datang di DARFIN MARKET${name}.`,
    "",
    "Market data, watchlist, and alerts langsung dari Telegram.",
    "",
    "Yang bisa kamu pantau:",
    "• Crypto lokal (INDODAX IDR) & global (CoinPaprika)",
    "• Saham Indonesia (IDX) & Internasional (US/Global)",
    "• Kurs referensi mata uang & konversi (Frankfurter)",
    "• Grafik historis, Watchlist personal, dan Price Alerts",
    "",
    "Catatan: bot ini bersifat read-only untuk informasi pasar, bukan broker, exchange, atau rekomendasi investasi.",
  ].join("\n");

  await ctx.reply(message, { reply_markup: buildMainMenuKeyboard() });
}
