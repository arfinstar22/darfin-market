import { env } from "../config/env.js";
import type { AlertRepository } from "../db/repositories/alert.repo.js";
import type { PriceAlertRow } from "../db/schema/index.js";
import type { AlertCondition, AlertEvaluationResult } from "../types/alert.js";
import type { ProviderName } from "../types/provider.js";
import { compareDecimals, isValidPositiveDecimal, toDecimalString } from "../utils/decimal.js";
import { ValidationError } from "../utils/errors.js";
import type { MarketService } from "./market.service.js";
import type { StockService } from "./stock.service.js";

/**
 * Pure threshold-crossing state machine.
 * Prevents repeated spam and requires genuine crossing across the target threshold.
 * Never triggers on stale data.
 */
export function evaluateAlertCrossing(params: {
  status: string;
  condition: AlertCondition;
  targetPrice: string;
  lastObservedPrice: string | null;
  currentPrice: string;
  isStale: boolean;
}): AlertEvaluationResult {
  if (params.status !== "active") {
    return { shouldTrigger: false, reason: "not_active" };
  }
  if (params.isStale) {
    return { shouldTrigger: false, reason: "stale_data" };
  }
  if (!isValidPositiveDecimal(params.currentPrice) || !isValidPositiveDecimal(params.targetPrice)) {
    return { shouldTrigger: false, reason: "invalid_price" };
  }

  // First observation after alert creation (if created without initial baseline):
  // record baseline without immediately firing if price is already on target side.
  if (params.lastObservedPrice === null || !isValidPositiveDecimal(params.lastObservedPrice)) {
    return { shouldTrigger: false, reason: "baseline_recorded" };
  }

  const prevCmp = compareDecimals(params.lastObservedPrice, params.targetPrice);
  const currCmp = compareDecimals(params.currentPrice, params.targetPrice);

  if (params.condition === "above") {
    // Must cross from strictly below target (<) to at/above target (>=)
    if (prevCmp < 0 && currCmp >= 0) {
      return { shouldTrigger: true, reason: "crossed_above" };
    }
    if (prevCmp >= 0 && currCmp >= 0) {
      return { shouldTrigger: false, reason: "already_on_target_side" };
    }
    return { shouldTrigger: false, reason: "not_crossed" };
  }

  // condition === "below": must cross from strictly above target (>) to at/below target (<=)
  if (prevCmp > 0 && currCmp <= 0) {
    return { shouldTrigger: true, reason: "crossed_below" };
  }
  if (prevCmp <= 0 && currCmp <= 0) {
    return { shouldTrigger: false, reason: "already_on_target_side" };
  }
  return { shouldTrigger: false, reason: "not_crossed" };
}

export class AlertService {
  constructor(
    private readonly repo: AlertRepository,
    private readonly marketService: MarketService,
    private readonly stockService: StockService,
  ) {}

  async createAlert(params: {
    userId: string;
    symbolInput: string;
    conditionRaw: string;
    targetPriceRaw: string;
    quoteCurrencyRaw?: string;
  }): Promise<{ alert: PriceAlertRow; currentPrice: string; sourceLabel: string }> {
    const activeCount = await this.repo.countActiveByUser(params.userId);
    if (activeCount >= env.MAX_ACTIVE_ALERTS_PER_USER) {
      throw new ValidationError(
        `Batas maksimal ${env.MAX_ACTIVE_ALERTS_PER_USER} alert aktif tercapai. Hapus atau jeda alert lama terlebih dahulu.`,
      );
    }

    const condition = params.conditionRaw.trim().toLowerCase();
    if (condition !== "above" && condition !== "below") {
      throw new ValidationError(
        "Kondisi alert harus 'above' atau 'below'. Contoh: /alert add BTC above 1500000000 IDR",
      );
    }

    const cleanedTarget = params.targetPriceRaw.trim().replace(/[_,]/g, "");
    if (!isValidPositiveDecimal(cleanedTarget)) {
      throw new ValidationError("Harga target harus angka positif.");
    }
    const targetPrice = toDecimalString(cleanedTarget);
    const preferredQuote = params.quoteCurrencyRaw?.trim().toUpperCase();
    const symInput = params.symbolInput.trim();

    // Resolve market ticker & source
    let resolved: {
      assetId: string;
      symbol: string;
      provider: ProviderName;
      marketPair: string | null;
      quoteCurrency: string;
      currentPrice: string;
      sourceLabel: string;
    } | null = null;

    const wantsStock =
      symInput.toUpperCase().endsWith(".JK") ||
      symInput.toUpperCase().endsWith(":IDX") ||
      symInput.toUpperCase().startsWith("IDX:");

    if (!wantsStock) {
      const crypto = await this.marketService.lookupCrypto(symInput);
      if (preferredQuote === "IDR" || (!preferredQuote && crypto.indodaxTicker)) {
        if (crypto.indodaxTicker) {
          resolved = {
            assetId: crypto.indodaxTicker.assetId,
            symbol: crypto.indodaxTicker.symbol,
            provider: "indodax",
            marketPair: crypto.indodaxTicker.marketPair ?? null,
            quoteCurrency: "IDR",
            currentPrice: crypto.indodaxTicker.price,
            sourceLabel: crypto.indodaxTicker.sourceLabel,
          };
        }
      }
      if (!resolved && (preferredQuote === "USD" || !preferredQuote) && crypto.globalTicker) {
        resolved = {
          assetId: crypto.globalTicker.assetId,
          symbol: crypto.globalTicker.symbol,
          provider: "coinpaprika",
          marketPair: null,
          quoteCurrency: "USD",
          currentPrice: crypto.globalTicker.price,
          sourceLabel: crypto.globalTicker.sourceLabel,
        };
      }
    }

    // Try stock if not resolved as crypto
    if (!resolved) {
      const stock = await this.stockService.lookupStock(symInput);
      if (stock.ticker) {
        if (preferredQuote && stock.ticker.quoteCurrency !== preferredQuote) {
          throw new ValidationError(
            `Saham ${stock.ticker.symbol} dikuotasikan dalam ${stock.ticker.quoteCurrency}, bukan ${preferredQuote}.`,
          );
        }
        resolved = {
          assetId: stock.ticker.assetId,
          symbol: stock.ticker.symbol,
          provider: stock.ticker.provider,
          marketPair: stock.ticker.exchange ?? null,
          quoteCurrency: stock.ticker.quoteCurrency,
          currentPrice: stock.ticker.price,
          sourceLabel: stock.ticker.sourceLabel,
        };
      } else if (stock.unconfiguredHint && wantsStock) {
        throw new ValidationError(stock.unconfiguredHint);
      }
    }

    if (!resolved) {
      throw new ValidationError(
        `Aset ${symInput.toUpperCase()} tidak ditemukan${preferredQuote ? ` untuk mata uang ${preferredQuote}` : ""}.`,
      );
    }

    const alert = await this.repo.create({
      userId: params.userId,
      assetId: resolved.assetId,
      symbol: resolved.symbol,
      provider: resolved.provider,
      marketPair: resolved.marketPair,
      quoteCurrency: resolved.quoteCurrency,
      condition,
      targetPrice,
      initialObservedPrice: resolved.currentPrice,
    });

    return {
      alert,
      currentPrice: resolved.currentPrice,
      sourceLabel: resolved.sourceLabel,
    };
  }

  async listUserAlerts(userId: string): Promise<PriceAlertRow[]> {
    return this.repo.listByUser(userId);
  }

  async deleteAlert(userId: string, alertIdPrefix: string): Promise<PriceAlertRow | null> {
    return this.repo.updateStatus(userId, alertIdPrefix.trim(), "deleted");
  }

  async pauseAlert(userId: string, alertIdPrefix: string): Promise<PriceAlertRow | null> {
    return this.repo.updateStatus(userId, alertIdPrefix.trim(), "paused");
  }

  async resumeAlert(userId: string, alertIdPrefix: string): Promise<PriceAlertRow | null> {
    return this.repo.updateStatus(userId, alertIdPrefix.trim(), "active");
  }
}
