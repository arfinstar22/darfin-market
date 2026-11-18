import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import type { BotContext } from "../context.js";
import { formatAlertsListMessage } from "../formatters/messages.js";
import { formatCurrencyAmount } from "../formatters/number.js";

export async function showAlerts(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) {
    await ctx.reply("Jalankan /start terlebih dahulu.");
    return;
  }
  const tz = ctx.dbUser.timezone ?? env.APP_TIMEZONE;
  const alerts = await ctx.services.alertService.listUserAlerts(ctx.dbUser.id);
  const kb = new InlineKeyboard();
  for (const a of alerts.slice(0, 6)) {
    const shortId = a.id.slice(0, 8);
    if (a.status === "active") {
      kb.text(`⏸️ ${a.symbol} (${shortId})`, `alertpause:${shortId}`);
    } else if (a.status === "paused" || a.status === "triggered") {
      kb.text(`▶️ ${a.symbol} (${shortId})`, `alertresume:${shortId}`);
    }
    kb.text(`🗑️ Hapus`, `alertdel:${shortId}`).row();
  }
  kb.text("🔄 Refresh", "menu:alerts").text("⬅️ Menu Utama", "menu:home");

  await ctx.reply(formatAlertsListMessage(alerts, tz), { reply_markup: kb });
}

export async function handleAlertCommand(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) {
    await ctx.reply("Jalankan /start terlebih dahulu.");
    return;
  }

  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const parts = arg.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    await showAlerts(ctx);
    return;
  }

  // Support both "/alert add BTC above 1500000000 IDR" and "/alert BTC above 1500000000 IDR"
  const startIdx = parts[0]?.toLowerCase() === "add" ? 1 : 0;
  const symbolInput = parts[startIdx];
  const conditionRaw = parts[startIdx + 1];
  const targetPriceRaw = parts[startIdx + 2];
  const quoteCurrencyRaw = parts[startIdx + 3];

  if (!symbolInput || !conditionRaw || !targetPriceRaw) {
    await ctx.reply(
      "Format alert:\n/alert add <SIMBOL> <above|below> <TARGET> [IDR|USD]\n\nContoh:\n/alert add BTC above 1500000000 IDR\n/alert add BBCA below 9500 IDR\n/alert add AAPL above 250 USD",
    );
    return;
  }

  const { alert, currentPrice, sourceLabel } = await ctx.services.alertService.createAlert({
    userId: ctx.dbUser.id,
    symbolInput,
    conditionRaw,
    targetPriceRaw,
    quoteCurrencyRaw,
  });

  const condLabel = alert.condition === "above" ? "naik melewati" : "turun melewati";
  await ctx.reply(
    [
      "✅ Price alert dibuat!",
      "",
      `ID            : ${alert.id.slice(0, 8)}`,
      `Aset          : ${alert.symbol}/${alert.quoteCurrency}`,
      `Kondisi       : ${condLabel} ${formatCurrencyAmount(alert.targetPrice, alert.quoteCurrency)}`,
      `Harga saat ini: ${formatCurrencyAmount(currentPrice, alert.quoteCurrency)}`,
      sourceLabel,
      "",
      "Alert akan mengirim notifikasi satu kali saat harga benar-benar melintasi target.",
    ].join("\n"),
  );
}

export async function handleAlertRemoveCommand(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  const id = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!id) {
    await ctx.reply("Format: /alertremove <ID_ALERT>\nLihat ID alert dengan /alerts");
    return;
  }
  const deleted = await ctx.services.alertService.deleteAlert(ctx.dbUser.id, id);
  await ctx.reply(deleted ? `🗑️ Alert ${deleted.id.slice(0, 8)} dihapus.` : "Alert tidak ditemukan.");
}

export async function handleAlertPauseCommand(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  const id = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!id) {
    await ctx.reply("Format: /alertpause <ID_ALERT>");
    return;
  }
  const paused = await ctx.services.alertService.pauseAlert(ctx.dbUser.id, id);
  await ctx.reply(paused ? `⏸️ Alert ${paused.id.slice(0, 8)} dijeda.` : "Alert tidak ditemukan.");
}

export async function handleAlertResumeCommand(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser) return;
  const id = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!id) {
    await ctx.reply("Format: /alertresume <ID_ALERT>");
    return;
  }
  const resumed = await ctx.services.alertService.resumeAlert(ctx.dbUser.id, id);
  await ctx.reply(
    resumed ? `▶️ Alert ${resumed.id.slice(0, 8)} diaktifkan kembali.` : "Alert tidak ditemukan.",
  );
}
