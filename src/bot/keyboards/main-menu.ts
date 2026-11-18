import { InlineKeyboard } from "grammy";
import { getValidHttpsWebAppUrl } from "../commands/webapp.js";

export function buildMainMenuKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  const webAppUrl = getValidHttpsWebAppUrl();
  if (webAppUrl) {
    kb.webApp("📱 Buka Live Dashboard (Mini App)", webAppUrl).row();
  }

  return kb
    .text("📊 Market Overview", "menu:market")
    .text("🪙 Crypto Prices", "menu:crypto")
    .row()
    .text("🇮🇩 Saham Indonesia (IDX)", "menu:stocks_idx")
    .text("🌎 Saham Global (US)", "menu:stocks_us")
    .row()
    .text("📈 Top Gainers", "menu:top_gainers")
    .text("📉 Top Losers", "menu:top_losers")
    .row()
    .text("💱 Currency Converter", "menu:fx")
    .text("⭐ My Watchlist", "menu:watchlist")
    .row()
    .text("🔔 Price Alerts", "menu:alerts")
    .text("⚙️ Settings", "menu:settings");
}
