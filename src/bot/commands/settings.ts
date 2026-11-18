import { InlineKeyboard } from "grammy";
import { env } from "../../config/env.js";
import { isValidTimezone } from "../../utils/dates.js";
import type { BotContext } from "../context.js";
import { buildTimezoneKeyboard } from "../keyboards/market-menu.js";

export async function showSettings(ctx: BotContext): Promise<void> {
  const currentTz = ctx.dbUser?.timezone ?? env.APP_TIMEZONE;
  const text = [
    "⚙️ PENGATURAN DARFIN MARKET",
    "",
    `Zona waktu saat ini : ${currentTz}`,
    "Bahasa              : Bahasa Indonesia",
    "",
    "Pilih zona waktu tampilan di bawah ini:",
  ].join("\n");

  await ctx.reply(text, { reply_markup: buildTimezoneKeyboard(currentTz) });
}

export async function updateTimezone(ctx: BotContext, tz: string): Promise<void> {
  if (!ctx.dbUser) return;
  if (!isValidTimezone(tz)) {
    await ctx.reply("Zona waktu tidak valid.");
    return;
  }
  await ctx.services.userRepo.updateTimezone(ctx.dbUser.id, tz);
  ctx.dbUser.timezone = tz;
  await ctx.reply(`✅ Zona waktu diperbarui menjadi ${tz}.`, {
    reply_markup: buildTimezoneKeyboard(tz),
  });
}

export async function handleDeleteMyDataCommand(ctx: BotContext): Promise<void> {
  const kb = new InlineKeyboard()
    .text("⚠️ Ya, hapus semua data saya", "confirm_delete_data")
    .text("Batal", "menu:home");

  await ctx.reply(
    "Konfirmasi penghapusan data:\nIni akan menghapus profil, seluruh watchlist, dan semua price alerts kamu secara permanen.",
    { reply_markup: kb },
  );
}
