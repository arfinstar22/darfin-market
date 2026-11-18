import { env } from "../../config/env.js";
import type { BotContext } from "../context.js";
import { formatStockDetailMessage } from "../formatters/messages.js";
import {
  buildAssetActionKeyboard,
  buildPopularIdxStocksKeyboard,
  buildPopularUsStocksKeyboard,
  buildSearchResultsKeyboard,
} from "../keyboards/market-menu.js";

export async function showPopularIdxStocks(ctx: BotContext): Promise<void> {
  const list = ctx.services.stockService
    .getPopularIdxStocks()
    .map((s) => `• ${s.symbol} - ${s.name}`)
    .join("\n");

  const text = [
    "🇮🇩 SAHAM POPULER INDONESIA (IDX)",
    "",
    list,
    "",
    "Pilih tombol di bawah atau ketik /stock BBCA (bisa juga /stock TLKM.JK).",
  ].join("\n");

  await ctx.reply(text, { reply_markup: buildPopularIdxStocksKeyboard() });
}

export async function showPopularUsStocks(ctx: BotContext): Promise<void> {
  const list = ctx.services.stockService
    .getPopularUsStocks()
    .map((s) => `• ${s.symbol} - ${s.name} (${s.exchange})`)
    .join("\n");

  const text = [
    "🌎 SAHAM POPULER INTERNASIONAL (US)",
    "",
    list,
    "",
    "Pilih tombol di bawah atau ketik /stock AAPL atau /stock NVDA.",
  ].join("\n");

  await ctx.reply(text, { reply_markup: buildPopularUsStocksKeyboard() });
}

export async function showStockPrice(ctx: BotContext, rawSymbol: string): Promise<void> {
  const symbol = rawSymbol.trim();
  if (!symbol || symbol.length > 40) {
    await showPopularIdxStocks(ctx);
    return;
  }

  const tz = ctx.dbUser?.timezone ?? env.APP_TIMEZONE;
  const res = await ctx.services.stockService.lookupStock(symbol);

  if (!res.ticker) {
    await ctx.reply(formatStockDetailMessage(res, tz));
    return;
  }

  const lookupKey = res.ticker.assetId;
  await ctx.reply(formatStockDetailMessage(res, tz), {
    reply_markup: buildAssetActionKeyboard({
      assetClass: "stock",
      lookupKey,
      symbol: res.ticker.symbol,
    }),
  });
}

export async function handleStockCommand(ctx: BotContext): Promise<void> {
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  await showStockPrice(ctx, arg);
}

export async function handleStocksListCommand(ctx: BotContext): Promise<void> {
  const arg = typeof ctx.match === "string" ? ctx.match.trim().toLowerCase() : "";
  if (arg === "us" || arg === "global") {
    await showPopularUsStocks(ctx);
    return;
  }
  await showPopularIdxStocks(ctx);
}

export async function handleStockSearchCommand(ctx: BotContext): Promise<void> {
  const query = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!query) {
    await ctx.reply("Masukkan kata kunci saham. Contoh: /stocksearch bank atau /stocksearch apple");
    return;
  }

  const results = await ctx.services.searchService.searchStocks(query, 8);
  if (results.length === 0) {
    await ctx.reply("Saham tidak ditemukan. Coba kode ticker atau nama emiten lain.");
    return;
  }

  await ctx.reply(`🔎 Hasil pencarian saham untuk "${query}":`, {
    reply_markup: buildSearchResultsKeyboard(results),
  });
}
