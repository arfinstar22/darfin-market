import type { BotContext } from "../context.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.js";

export async function handleHelp(ctx: BotContext): Promise<void> {
  const text = [
    "📘 PANDUAN COMMAND DARFIN MARKET",
    "",
    "PASAR & CRYPTO",
    "• /market - Ringkasan crypto global, INDODAX, & USD/IDR",
    "• /crypto BTC - Harga crypto lokal (INDODAX) & global",
    "• /search bitcoin - Cari aset crypto & saham",
    "• /top gainers | /top losers - Pergerakan 24 jam",
    "",
    "SAHAM INDONESIA (IDX) & INTERNASIONAL",
    "• /stocks - Daftar saham populer IDX & US",
    "• /stock BBCA - Cek saham Indonesia (IDX)",
    "• /stock AAPL - Cek saham US/Global",
    "• /stocksearch bank - Cari kode saham",
    "",
    "KURS & GRAFIK",
    "• /fx USD - Kurs referensi mata uang",
    "• /convert 100 USD IDR - Konversi mata uang",
    "• /chart BTC 1d | /chart BBCA 30d - Grafik harga",
    "",
    "WATCHLIST & ALERT",
    "• /watchlist - Lihat daftar pantauan",
    "• /watchadd BTC | /watchadd BBCA - Tambah watchlist",
    "• /watchremove BTC - Hapus dari watchlist",
    "• /alert add BTC above 1500000000 IDR - Buat alert",
    "• /alerts - Lihat semua alert",
    "• /alertpause <id> | /alertresume <id> | /alertremove <id>",
    "",
    "LAINNYA",
    "• /webapp - Buka Mini App Live Terminal",
    "• /settings - Atur zona waktu",
    "• /status - Status layanan & provider",
    "• /delete_my_data - Hapus semua data akunmu",
  ].join("\n");

  await ctx.reply(text, { reply_markup: buildMainMenuKeyboard() });
}
