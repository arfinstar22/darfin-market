import { InlineKeyboard } from "grammy";
import { getValidHttpsWebAppUrl } from "../commands/webapp.js";

export function buildMainMenuKeyboard(pathQuery = ""): InlineKeyboard | undefined {
  const webAppUrl = getValidHttpsWebAppUrl(pathQuery);
  if (!webAppUrl) {
    return undefined;
  }
  return new InlineKeyboard().webApp("📱 Buka DARFIN MARKET", webAppUrl);
}
