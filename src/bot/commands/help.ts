import type { BotContext } from "../context.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.js";

export async function handleHelp(ctx: BotContext): Promise<void> {
  const kb = buildMainMenuKeyboard();
  const text = [
    "📱 DARFIN MARKET berjalan penuh melalui Telegram Mini App.",
    "",
    "Tekan tombol di bawah (atau tombol menu di kiri bawah chat) untuk membuka Live Terminal:",
    "• Saham Indonesia (IDX) & Global (US)",
    "• Crypto INDODAX (IDR) & Global",
    "• Grafik interaktif, Kurs, Watchlist, & Price Alerts",
    "",
    "Command tambahan:",
    "• /status - Cek status layanan & provider",
    "• /delete_my_data - Hapus semua data akun",
  ].join("\n");

  await ctx.reply(text, kb ? { reply_markup: kb } : undefined);
}
