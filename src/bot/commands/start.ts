import type { BotContext } from "../context.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.js";

export async function handleStart(ctx: BotContext): Promise<void> {
  const name = ctx.from?.first_name ? `, ${ctx.from.first_name}` : "";
  const kb = buildMainMenuKeyboard();

  const message = [
    `👋 Selamat datang di DARFIN MARKET${name}.`,
    "",
    "Pantau saham Indonesia (IDX), saham Global (US), crypto, kurs mata uang, grafik interaktif, watchlist, dan price alerts langsung lewat Mini App di bawah ini.",
    "",
    "Catatan: informasi pasar bersifat read-only, bukan broker atau rekomendasi investasi.",
  ].join("\n");

  if (!kb) {
    await ctx.reply(
      `${message}\n\n⚠️ URL Mini App (WEBAPP_URL / RENDER_EXTERNAL_URL) belum aktif dengan HTTPS.`,
    );
    return;
  }

  await ctx.reply(message, { reply_markup: kb });
}
