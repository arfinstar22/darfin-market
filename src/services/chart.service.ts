import type { SnapshotRepository } from "../db/repositories/snapshot.repo.js";
import type { CoinPaprikaProvider } from "../providers/coinpaprika/provider.js";
import type { GoApiIdxProvider } from "../providers/goapi/provider.js";
import type { IndodaxProvider } from "../providers/indodax/provider.js";
import type { TwelveDataProvider } from "../providers/twelvedata/provider.js";
import type { YahooFinanceIdxProvider } from "../providers/yahoo/provider.js";
import type { ChartRange, ChartSeries } from "../types/market.js";
import { ValidationError } from "../utils/errors.js";
import { parseStockInput } from "./stock.service.js";

const RANGE_DAYS: Record<ChartRange, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function parseChartRange(raw?: string): ChartRange {
  const clean = (raw ?? "7d").trim().toLowerCase();
  if (clean === "1d" || clean === "7d" || clean === "30d" || clean === "90d") {
    return clean;
  }
  throw new ValidationError("Periode chart yang didukung: 1d, 7d, 30d, 90d. Contoh: /chart BTC 7d");
}

export class ChartService {
  constructor(
    private readonly snapshots: SnapshotRepository,
    private readonly indodax: IndodaxProvider,
    private readonly coinpaprika: CoinPaprikaProvider,
    private readonly twelvedata: TwelveDataProvider,
    private readonly goapi?: GoApiIdxProvider,
    private readonly yahoo?: YahooFinanceIdxProvider,
  ) {}

  async getChartSeries(symbolInput: string, range: ChartRange): Promise<ChartSeries> {
    const clean = symbolInput.trim();
    const upper = clean.toUpperCase();
    const since = new Date(Date.now() - RANGE_DAYS[range] * 86_400_000);

    // 1. Check if stock (IDX via GoAPI or Yahoo Finance, then Twelve Data for US/Global)
    const parsedStock = parseStockInput(clean);
    const looksLikeStock =
      upper.endsWith(".JK") ||
      upper.endsWith(":IDX") ||
      upper.startsWith("IDX:") ||
      parsedStock.market === "IDX";

    if (parsedStock.market === "IDX" && this.goapi?.isConfigured()) {
      const candles = await this.goapi.getHistoricalCandles(
        { symbol: parsedStock.symbol, exchange: "IDX" },
        range,
      );
      if (candles.length >= 2) {
        return {
          provider: "goapi",
          assetId: `${parsedStock.symbol}:IDX`,
          symbol: parsedStock.symbol,
          quoteCurrency: "IDR",
          range,
          points: candles.map((c) => ({ timestamp: c.timestamp, price: c.close })),
          sourceNote: "Sumber: GoAPI.io (IDX) - data historis harian",
          startedAt: candles[0]!.timestamp,
          endedAt: candles[candles.length - 1]!.timestamp,
        };
      }
    }

    if (parsedStock.market === "IDX" && this.yahoo?.isConfigured()) {
      const candles = await this.yahoo.getHistoricalCandles(
        { symbol: parsedStock.symbol, exchange: "IDX" },
        range,
      );
      if (candles.length >= 2) {
        return {
          provider: "yahoo",
          assetId: `${parsedStock.symbol}:IDX`,
          symbol: parsedStock.symbol,
          quoteCurrency: "IDR",
          range,
          points: candles.map((c) => ({ timestamp: c.timestamp, price: c.close })),
          sourceNote: "Sumber: Yahoo Finance (IDX) — delay ~15 menit",
          startedAt: candles[0]!.timestamp,
          endedAt: candles[candles.length - 1]!.timestamp,
        };
      }
    }

    if (looksLikeStock || (this.twelvedata.isConfigured() && !(await this.indodax.resolvePair(upper, "IDR")))) {
      if (this.twelvedata.isConfigured()) {
        const candles = await this.twelvedata.getHistoricalCandles(
          { symbol: parsedStock.symbol, exchange: parsedStock.exchange },
          range,
        );
        if (candles.length >= 2) {
          return {
            provider: "twelvedata",
            assetId: parsedStock.exchange ? `${parsedStock.symbol}:${parsedStock.exchange}` : parsedStock.symbol,
            symbol: parsedStock.symbol,
            quoteCurrency: parsedStock.market === "IDX" ? "IDR" : "USD",
            range,
            points: candles.map((c) => ({ timestamp: c.timestamp, price: c.close })),
            sourceNote: `Sumber: Twelve Data (${parsedStock.exchange ?? "Global"})`,
            startedAt: candles[0]!.timestamp,
            endedAt: candles[candles.length - 1]!.timestamp,
          };
        }
      }
      if (looksLikeStock) {
        throw new ValidationError(
          "Grafik saham IDX memerlukan GOAPI_API_KEY (gratis di goapi.io) atau data historis belum tersedia untuk simbol ini.",
        );
      }
    }

    // 2. Check INDODAX local snapshots first if pair exists
    const indodaxPair = await this.indodax.resolvePair(upper, "IDR");
    if (indodaxPair) {
      const rows = await this.snapshots.getSeries("indodax", indodaxPair.id, "IDR", since);
      if (rows.length >= 2) {
        const firstDate = rows[0]!.observedAt.toISOString();
        const lastDate = rows[rows.length - 1]!.observedAt.toISOString();
        return {
          provider: "indodax",
          assetId: indodaxPair.id,
          symbol: indodaxPair.tradedCurrencyUnit,
          quoteCurrency: "IDR",
          range,
          points: rows.map((r) => ({ timestamp: r.observedAt.toISOString(), price: r.price })),
          sourceNote: `Data dikumpulkan DARFIN MARKET dari INDODAX mulai ${firstDate.slice(0, 10)}`,
          startedAt: firstDate,
          endedAt: lastDate,
        };
      }
    }

    // 3. Fallback to CoinPaprika 1d OHLCV (free tier supports latest 24h only)
    const cpCandidates = await this.coinpaprika.resolveSymbolCandidates(clean);
    const chosen = cpCandidates[0];
    if (chosen) {
      if (range === "1d") {
        const candles = await this.coinpaprika.getHistoricalData(chosen.assetId, "1d");
        if (candles.length > 0) {
          const c = candles[0]!;
          // Represent OHLC summary points when only 1 daily candle is available from free tier
          const pts =
            candles.length >= 2
              ? candles.map((item) => ({ timestamp: item.timestamp, price: item.close }))
              : [
                  { timestamp: new Date(Date.parse(c.timestamp) - 86_400_000).toISOString(), price: c.open },
                  { timestamp: new Date(Date.parse(c.timestamp) - 43_200_000).toISOString(), price: c.high },
                  { timestamp: new Date(Date.parse(c.timestamp) - 21_600_000).toISOString(), price: c.low },
                  { timestamp: c.timestamp, price: c.close },
                ];
          return {
            provider: "coinpaprika",
            assetId: chosen.assetId,
            symbol: chosen.symbol,
            quoteCurrency: "USD",
            range: "1d",
            points: pts,
            sourceNote: "Sumber: CoinPaprika OHLCV 24h (Powered by CoinPaprika)",
            startedAt: pts[0]!.timestamp,
            endedAt: pts[pts.length - 1]!.timestamp,
          };
        }
      }

      throw new ValidationError(
        `Data historis ${range} untuk ${chosen.symbol} belum cukup. CoinPaprika free tier hanya menyediakan OHLCV 1d (/chart ${chosen.symbol} 1d), sedangkan snapshot lokal INDODAX masih dikumpulkan oleh worker.`,
      );
    }

    throw new ValidationError(`Data grafik untuk ${upper} tidak ditemukan.`);
  }
}
