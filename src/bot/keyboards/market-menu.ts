import { InlineKeyboard } from "grammy";
import {
  POPULAR_CRYPTO_SYMBOLS,
  POPULAR_IDX_STOCKS,
  POPULAR_US_STOCKS,
  SUPPORTED_TIMEZONES,
} from "../../config/constants.js";
import type { AssetSearchResult } from "../../types/market.js";
import { getValidHttpsWebAppUrl } from "../commands/webapp.js";

export function buildPopularCryptoKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  POPULAR_CRYPTO_SYMBOLS.forEach((sym, i) => {
    kb.text(sym, `crypto:${sym}`);
    if ((i + 1) % 4 === 0) kb.row();
  });
  kb.row().text("⬅️ Menu Utama", "menu:home");
  return kb;
}

export function buildPopularIdxStocksKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  POPULAR_IDX_STOCKS.forEach((stock, i) => {
    kb.text(stock.symbol, `stock:${stock.symbol}:IDX`);
    if ((i + 1) % 3 === 0) kb.row();
  });
  const webAppUrl = getValidHttpsWebAppUrl();
  if (webAppUrl) {
    kb.row().webApp("📱 Pantau Live Saham IDX (Mini App)", webAppUrl);
  }
  kb.row()
    .text("🌎 Saham Global (US)", "menu:stocks_us")
    .text("⬅️ Menu Utama", "menu:home");
  return kb;
}

export function buildPopularUsStocksKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  POPULAR_US_STOCKS.forEach((stock, i) => {
    kb.text(stock.symbol, `stock:${stock.symbol}:US`);
    if ((i + 1) % 3 === 0) kb.row();
  });
  const webAppUrl = getValidHttpsWebAppUrl("?asset=AAPL&type=stock");
  if (webAppUrl) {
    kb.row().webApp("📱 Pantau Live Saham US (Mini App)", webAppUrl);
  }
  kb.row()
    .text("🇮🇩 Saham Indonesia (IDX)", "menu:stocks_idx")
    .text("⬅️ Menu Utama", "menu:home");
  return kb;
}

export function buildAssetActionKeyboard(params: {
  assetClass: "crypto" | "stock";
  lookupKey: string;
  symbol: string;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (params.assetClass === "crypto") {
    kb.text("🔄 Refresh", `crypto:${params.lookupKey}`)
      .text("⭐ + Watchlist", `watchadd:crypto:${params.lookupKey}`)
      .row()
      .text("📉 Chart 1d", `chart:${params.symbol}:1d`)
      .text("📉 Chart 7d", `chart:${params.symbol}:7d`);
  } else {
    kb.text("🔄 Refresh", `stock:${params.lookupKey}`)
      .text("⭐ + Watchlist", `watchadd:stock:${params.lookupKey}`)
      .row()
      .text("📉 Chart 7d", `chart:${params.lookupKey}:7d`)
      .text("📉 Chart 30d", `chart:${params.lookupKey}:30d`);
  }
  const deepUrl = getValidHttpsWebAppUrl(
    `?asset=${encodeURIComponent(params.lookupKey)}&type=${params.assetClass}`,
  );
  if (deepUrl) {
    kb.row().webApp("📱 Buka Live Chart (Mini App)", deepUrl);
  }
  kb.row().text("⬅️ Menu Utama", "menu:home");
  return kb;
}

export function buildSearchResultsKeyboard(results: AssetSearchResult[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const r of results.slice(0, 8)) {
    const label =
      r.assetClass === "stock"
        ? `📈 ${r.symbol} (${r.exchange ?? r.market ?? "STOCK"}) - ${r.name.slice(0, 22)}`
        : `🪙 ${r.symbol} - ${r.name.slice(0, 24)}`;
    const callbackData =
      r.assetClass === "stock"
        ? `stock:${r.assetId}`
        : `crypto:${r.assetId}`;
    kb.text(label, callbackData.slice(0, 64)).row();
  }
  kb.text("⬅️ Menu Utama", "menu:home");
  return kb;
}

export function buildFxQuickKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("USD -> IDR", "fx:USD")
    .text("EUR -> IDR", "fx:EUR")
    .text("SGD -> IDR", "fx:SGD")
    .row()
    .text("JPY -> IDR", "fx:JPY")
    .text("GBP -> IDR", "fx:GBP")
    .text("AUD -> IDR", "fx:AUD")
    .row()
    .text("⬅️ Menu Utama", "menu:home");
}

export function buildTimezoneKeyboard(currentTz: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const tz of SUPPORTED_TIMEZONES) {
    const prefix = tz === currentTz ? "✅ " : "";
    kb.text(`${prefix}${tz}`, `tz:${tz}`).row();
  }
  kb.text("⬅️ Menu Utama", "menu:home");
  return kb;
}
