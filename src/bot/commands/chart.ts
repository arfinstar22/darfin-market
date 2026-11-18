import { InputFile } from "grammy";
import { renderChartPng } from "../../charts/renderer.js";
import { parseChartRange } from "../../services/chart.service.js";
import type { BotContext } from "../context.js";

export async function sendChart(
  ctx: BotContext,
  symbol: string,
  rangeRaw?: string,
): Promise<void> {
  const cleanSymbol = symbol.trim();
  if (!cleanSymbol) {
    await ctx.reply("Format grafik: /chart <SIMBOL> [1d|7d|30d|90d]\nContoh: /chart BTC 1d atau /chart BBCA 30d");
    return;
  }

  const range = parseChartRange(rangeRaw);
  const series = await ctx.services.chartService.getChartSeries(cleanSymbol, range);
  const pngBuffer = renderChartPng(series);
  const caption = [
    `📉 ${series.symbol}/${series.quoteCurrency} (${series.range.toUpperCase()})`,
    series.sourceNote,
    `Periode: ${series.startedAt.slice(0, 16).replace("T", " ")} UTC s/d ${series.endedAt.slice(0, 16).replace("T", " ")} UTC`,
  ].join("\n");

  await ctx.replyWithPhoto(new InputFile(pngBuffer, `${series.symbol}-${series.range}.png`), {
    caption,
  });
}

export async function handleChartCommand(ctx: BotContext): Promise<void> {
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const parts = arg.split(/\s+/).filter(Boolean);
  const symbol = parts[0] ?? "";
  const range = parts[1];
  await sendChart(ctx, symbol, range);
}
