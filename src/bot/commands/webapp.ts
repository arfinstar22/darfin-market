import { InlineKeyboard } from "grammy";
import { getEffectiveWebAppUrl } from "../../config/env.js";
import type { BotContext } from "../context.js";

export function getValidHttpsWebAppUrl(pathQuery = ""): string | null {
  const configured = getEffectiveWebAppUrl();
  if (!configured || !configured.startsWith("https://")) {
    return null;
  }
  const base = configured.replace(/\/+$/, "");
  return `${base}/${pathQuery.replace(/^\/+/, "")}`;
}

export async function handleWebAppCommand(ctx: BotContext): Promise<void> {
  const url = getValidHttpsWebAppUrl();
  if (!url) {
    await ctx.reply(
      [
        "📱 DARFIN MARKET MINI APP",
        "",
        "Mini App belum memiliki URL HTTPS publik.",
        "Untuk mengaktifkan tombol Mini App di Telegram:",
        "1. Expose port WEBAPP_PORT (default 3000) dengan HTTPS (Nginx/Caddy atau Cloudflare Tunnel).",
        "2. Isi WEBAPP_URL=https://domain-kamu di file .env lalu restart bot.",
        "",
        "Untuk preview lokal di browser, jalankan: npm run dev:webapp lalu buka http://localhost:3000",
      ].join("\n"),
    );
    return;
  }

  const kb = new InlineKeyboard().webApp("📱 Buka DARFIN MARKET Terminal", url);
  await ctx.reply(
    "Buka Mini App DARFIN MARKET untuk memantau pergerakan saham Indonesia (IDX), saham Global (US), crypto, kurs, watchlist, dan grafik interaktif secara live:",
    { reply_markup: kb },
  );
}
