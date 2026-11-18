import type { BotContext } from "../context.js";
import { buildSearchResultsKeyboard } from "../keyboards/market-menu.js";

export async function handleSearchCommand(ctx: BotContext): Promise<void> {
  const query = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!query) {
    await ctx.reply("Masukkan kata kunci pencarian. Contoh: /search bitcoin atau /search BBCA");
    return;
  }
  if (query.length > 50) {
    await ctx.reply("Kata kunci terlalu panjang (maksimal 50 karakter).");
    return;
  }

  const [cryptoRes, stockRes] = await Promise.allSettled([
    ctx.services.searchService.searchCrypto(query, 5),
    ctx.services.searchService.searchStocks(query, 4),
  ]);

  const combined = [
    ...(stockRes.status === "fulfilled" ? stockRes.value : []),
    ...(cryptoRes.status === "fulfilled" ? cryptoRes.value : []),
  ];

  if (combined.length === 0) {
    await ctx.reply("Aset tidak ditemukan. Coba simbol atau nama lain.");
    return;
  }

  await ctx.reply(`🔎 Hasil pencarian untuk "${query}" (pilih aset):`, {
    reply_markup: buildSearchResultsKeyboard(combined),
  });
}
