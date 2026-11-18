import type { PriceAlertRow } from "../../db/schema/index.js";
import type { FxConversionResult } from "../../services/fx.service.js";
import type { CryptoLookupResult, MarketOverviewResult } from "../../services/market.service.js";
import type { SystemStatusSnapshot } from "../../services/provider-health.service.js";
import type { StockLookupResult } from "../../services/stock.service.js";
import type { WatchlistViewItem } from "../../services/watchlist.service.js";
import type { FxRate, MarketTicker } from "../../types/market.js";
import { formatTimestampForUser } from "../../utils/dates.js";
import { formatCompactUsd, formatCurrencyAmount, formatPercent, formatVolume } from "./number.js";

function formatFreshness(
  sourceUpdatedAt: string | undefined,
  fetchedAt: string,
  timezone: string,
  fromStaleCache?: boolean,
): string {
  const timeText = sourceUpdatedAt
    ? formatTimestampForUser(sourceUpdatedAt, timezone)
    : `diambil ${formatTimestampForUser(fetchedAt, timezone)}`;
  if (fromStaleCache) {
    return `data tersimpan, terakhir diperbarui ${timeText}`;
  }
  return timeText;
}

export function formatMarketOverviewMessage(data: MarketOverviewResult, timezone: string): string {
  const lines: string[] = ["📊 DARFIN MARKET - MARKET OVERVIEW", ""];

  lines.push("CRYPTO GLOBAL");
  if (data.globalStats) {
    const g = data.globalStats;
    lines.push(`• Total market cap: ${formatCompactUsd(g.marketCapUsd)} USD`);
    lines.push(`• Volume 24 jam: ${formatCompactUsd(g.volume24hUsd)} USD`);
    lines.push(`• BTC dominance: ${formatPercent(g.btcDominancePercent).replace("+", "")}`);
    lines.push("• Sumber: CoinPaprika (Powered by CoinPaprika)");
    lines.push(
      `• Data diperbarui: ${formatFreshness(g.sourceUpdatedAt, g.fetchedAt, timezone, g.fromStaleCache)}`,
    );
  } else {
    lines.push(`• Status: ${data.globalError ?? "Tidak tersedia"}`);
  }

  lines.push("");
  lines.push("INDODAX (IDR)");
  if (data.indodaxTickers.length > 0) {
    for (const t of data.indodaxTickers) {
      const pct = t.change24hPercent ? ` (${formatPercent(t.change24hPercent)})` : "";
      lines.push(`• ${t.symbol}/${t.quoteCurrency}: ${formatCurrencyAmount(t.price, t.quoteCurrency)}${pct}`);
    }
    const sample = data.indodaxTickers[0]!;
    lines.push("• Sumber: INDODAX");
    lines.push(
      `• Diperbarui: ${formatFreshness(sample.sourceUpdatedAt, sample.fetchedAt, timezone, sample.fromStaleCache)}`,
    );
  } else {
    lines.push(`• Status: ${data.indodaxError ?? "Tidak tersedia"}`);
  }

  lines.push("");
  lines.push("FX REFERENCE");
  if (data.usdIdrRate) {
    const r = data.usdIdrRate;
    lines.push(`• USD/IDR: ${formatCurrencyAmount(r.rate, "IDR")}`);
    lines.push(`• Tanggal referensi: ${r.referenceDate}`);
    lines.push("• Sumber: Frankfurter - kurs referensi");
    if (r.fromStaleCache) {
      lines.push("• Status: data tersimpan (cache)");
    }
  } else {
    lines.push(`• Status: ${data.fxError ?? "Tidak tersedia"}`);
  }

  lines.push("");
  lines.push("Gunakan /stocks untuk pantau saham Indonesia (IDX) & Internasional.");
  lines.push("Data pasar merupakan informasi, bukan rekomendasi investasi.");
  return lines.join("\n");
}

export function formatCryptoDetailMessage(res: CryptoLookupResult, timezone: string): string {
  const sym = res.indodaxTicker?.symbol ?? res.globalTicker?.symbol ?? res.query;
  const name = res.globalTicker?.name ?? res.indodaxTicker?.name ?? sym;
  const lines: string[] = [`🪙 ${name.toUpperCase()} (${sym})`, ""];

  if (res.indodaxTicker) {
    const t = res.indodaxTicker;
    lines.push(`INDODAX - ${t.symbol}/${t.quoteCurrency}`);
    lines.push(`Harga terakhir : ${formatCurrencyAmount(t.price, t.quoteCurrency)}`);
    if (t.change24hPercent) lines.push(`Perubahan 24h  : ${formatPercent(t.change24hPercent)}`);
    if (t.high24h && t.low24h) {
      lines.push(
        `High / Low 24h : ${formatCurrencyAmount(t.high24h, t.quoteCurrency)} / ${formatCurrencyAmount(t.low24h, t.quoteCurrency)}`,
      );
    }
    if (t.buy && t.sell) {
      lines.push(
        `Beli / Jual    : ${formatCurrencyAmount(t.buy, t.quoteCurrency)} / ${formatCurrencyAmount(t.sell, t.quoteCurrency)}`,
      );
    }
    lines.push(
      `Diperbarui     : ${formatFreshness(t.sourceUpdatedAt, t.fetchedAt, timezone, t.fromStaleCache)}`,
    );
    lines.push("");
  } else if (res.indodaxError) {
    lines.push(`INDODAX: ${res.indodaxError}`);
    lines.push("");
  }

  if (res.globalTicker) {
    const g = res.globalTicker;
    lines.push("GLOBAL - COINPAPRIKA");
    lines.push(`Harga          : ${formatCurrencyAmount(g.price, g.quoteCurrency)}`);
    if (g.marketCap) lines.push(`Market cap     : ${formatCompactUsd(g.marketCap)}`);
    if (g.volume24h) lines.push(`Volume 24 jam  : ${formatCompactUsd(g.volume24h)}`);
    if (g.change24hPercent) lines.push(`Perubahan 24h  : ${formatPercent(g.change24hPercent)}`);
    lines.push(
      `Diperbarui     : ${formatFreshness(g.sourceUpdatedAt, g.fetchedAt, timezone, g.fromStaleCache)}`,
    );
    lines.push("Powered by CoinPaprika");
    lines.push("");
  } else if (res.globalError) {
    lines.push(`GLOBAL: ${res.globalError}`);
    lines.push("");
  }

  if (res.indodaxTicker && res.globalTicker) {
    lines.push("Catatan: harga INDODAX dan agregat global dapat berbeda karena sumber pasar berbeda.");
  }
  lines.push("Data pasar merupakan informasi, bukan rekomendasi investasi.");
  return lines.join("\n").trim();
}

export function formatStockDetailMessage(res: StockLookupResult, timezone: string): string {
  if (!res.ticker) {
    return (
      res.unconfiguredHint ??
      res.error ??
      `Saham ${res.query} tidak ditemukan. Untuk saham Indonesia gunakan kode IDX (contoh: /stock BBCA atau /stock BBRI.JK).`
    );
  }

  const t = res.ticker;
  const headerName = t.name ? `${t.name} (${t.symbol})` : t.symbol;
  const exchangeTag = t.exchange ? ` [${t.exchange}]` : "";
  const lines: string[] = [
    `📈 ${headerName}${exchangeTag}`,
    "",
    `Harga terakhir : ${formatCurrencyAmount(t.price, t.quoteCurrency)}`,
  ];

  if (t.change24hPercent || t.change24h) {
    const absPart = t.change24h ? `${formatCurrencyAmount(t.change24h, t.quoteCurrency)} ` : "";
    const pctPart = t.change24hPercent ? `(${formatPercent(t.change24hPercent)})` : "";
    lines.push(`Perubahan      : ${absPart}${pctPart}`.trim());
  }
  if (t.open) lines.push(`Open           : ${formatCurrencyAmount(t.open, t.quoteCurrency)}`);
  if (t.high24h && t.low24h) {
    lines.push(
      `High / Low     : ${formatCurrencyAmount(t.high24h, t.quoteCurrency)} / ${formatCurrencyAmount(t.low24h, t.quoteCurrency)}`,
    );
  }
  if (t.previousClose) {
    lines.push(`Prev Close     : ${formatCurrencyAmount(t.previousClose, t.quoteCurrency)}`);
  }
  if (t.volume24h) {
    lines.push(`Volume         : ${formatVolume(t.volume24h)}`);
  }
  if (t.isMarketOpen !== undefined) {
    lines.push(`Status bursa   : ${t.isMarketOpen ? "Buka" : "Tutup"}`);
  }

  lines.push("");
  lines.push(t.sourceLabel);
  lines.push(
    `Waktu data     : ${formatFreshness(t.sourceUpdatedAt, t.fetchedAt, timezone, t.fromStaleCache)}`,
  );
  lines.push("Data pasar merupakan informasi, bukan rekomendasi investasi.");
  return lines.join("\n");
}

export function formatTopMoversMessage(
  direction: "gainers" | "losers",
  items: MarketTicker[],
  timezone: string,
): string {
  const title = direction === "gainers" ? "📈 TOP GAINERS 24H" : "📉 TOP LOSERS 24H";
  const lines: string[] = [title, ""];

  items.forEach((t, idx) => {
    lines.push(
      `${idx + 1}. ${t.symbol} (${t.name ?? t.symbol}) : ${formatCurrencyAmount(t.price, "USD")} | ${formatPercent(t.change24hPercent)}`,
    );
  });

  const sample = items[0];
  lines.push("");
  lines.push("Sumber: CoinPaprika (cakupan aset free tier) - Powered by CoinPaprika");
  if (sample) {
    lines.push(
      `Diperbarui: ${formatFreshness(sample.sourceUpdatedAt, sample.fetchedAt, timezone, sample.fromStaleCache)}`,
    );
  }
  return lines.join("\n");
}

export function formatFxRatesMessage(base: string, rates: FxRate[]): string {
  const lines: string[] = [`💱 KURS REFERENSI (${base})`, ""];
  for (const r of rates) {
    lines.push(`• 1 ${r.base} = ${formatCurrencyAmount(r.rate, r.quote)}`);
  }
  const refDate = rates[0]?.referenceDate ?? "-";
  lines.push("");
  lines.push(`Tanggal referensi: ${refDate}`);
  lines.push("Sumber: Frankfurter - kurs referensi");
  lines.push("Catatan: kurs referensi bukan harga jual/beli bank atau forex real-time.");
  return lines.join("\n");
}

export function formatFxConversionMessage(res: FxConversionResult): string {
  const lines = [
    "💱 KONVERSI MATA UANG",
    "",
    `${res.amount} ${res.base} ≈ ${formatCurrencyAmount(res.convertedAmount, res.quote)}`,
    "",
    `Kurs: 1 ${res.base} = ${formatCurrencyAmount(res.rate, res.quote)}`,
    "Sumber: Frankfurter - kurs referensi",
    `Tanggal referensi: ${res.referenceDate}`,
  ];
  if (res.fromStaleCache) {
    lines.push("Status: data tersimpan (cache)");
  }
  lines.push("");
  lines.push("Catatan: kurs referensi dapat berbeda dari kurs jual/beli bank dan money changer.");
  return lines.join("\n");
}

export function formatWatchlistMessage(items: WatchlistViewItem[], timezone: string): string {
  if (items.length === 0) {
    return "⭐ Watchlist kamu masih kosong.\n\nTambahkan aset dengan:\n/watchadd BTC\n/watchadd BBCA\n/watchadd AAPL";
  }

  const lines: string[] = ["⭐ MY WATCHLIST", ""];
  for (const item of items) {
    const label =
      item.row.assetClass === "stock"
        ? `${item.row.symbol} (${item.row.marketPair ?? "STOCK"})`
        : `${item.row.symbol}/${item.row.quoteCurrency}`;

    if (item.ticker) {
      const priceText = formatCurrencyAmount(item.ticker.price, item.ticker.quoteCurrency);
      const pct = item.ticker.change24hPercent
        ? ` | ${formatPercent(item.ticker.change24hPercent)}`
        : "";
      const staleTag = item.ticker.fromStaleCache ? " [cache]" : "";
      lines.push(`• ${label}: ${priceText}${pct}${staleTag}`);
      lines.push(`  ${item.ticker.sourceLabel}`);
    } else {
      lines.push(`• ${label}: ${item.error ?? "Harga tidak tersedia"}`);
    }
  }

  lines.push("");
  lines.push(`Diperiksa pada: ${formatTimestampForUser(new Date(), timezone)}`);
  return lines.join("\n");
}

export function formatAlertsListMessage(alerts: PriceAlertRow[], timezone: string): string {
  if (alerts.length === 0) {
    return (
      "🔔 Belum ada alert harga.\n\nContoh membuat alert:\n" +
      "/alert add BTC above 1500000000 IDR\n" +
      "/alert add BBCA below 9500 IDR\n" +
      "/alert add AAPL above 250 USD"
    );
  }

  const lines: string[] = ["🔔 PRICE ALERTS", ""];
  for (const a of alerts) {
    const shortId = a.id.slice(0, 8);
    const condText = a.condition === "above" ? "di atas" : "di bawah";
    const statusIcon =
      a.status === "active" ? "🟢" : a.status === "triggered" ? "✅" : "⏸️";
    lines.push(
      `${statusIcon} [${shortId}] ${a.symbol}/${a.quoteCurrency} ${condText} ${formatCurrencyAmount(a.targetPrice, a.quoteCurrency)}`,
    );
    lines.push(`   Sumber: ${a.provider.toUpperCase()} | Status: ${a.status}`);
    if (a.triggeredAt) {
      lines.push(`   Triggered: ${formatTimestampForUser(a.triggeredAt, timezone)}`);
    }
  }

  lines.push("");
  lines.push("Kelola: /alertpause <id>, /alertresume <id>, /alertremove <id>");
  return lines.join("\n");
}

export function formatTriggeredAlertNotification(params: {
  symbol: string;
  quoteCurrency: string;
  condition: "above" | "below";
  observedPrice: string;
  targetPrice: string;
  sourceLabel: string;
  observedAt: string;
  timezone: string;
}): string {
  const dir = params.condition === "above" ? "naik melewati" : "turun melewati";
  return [
    "🔔 DARFIN MARKET ALERT",
    "",
    `${params.symbol}/${params.quoteCurrency} telah ${dir} target yang kamu tentukan.`,
    `Harga terbaca : ${formatCurrencyAmount(params.observedPrice, params.quoteCurrency)}`,
    `Target        : ${formatCurrencyAmount(params.targetPrice, params.quoteCurrency)}`,
    params.sourceLabel,
    `Waktu         : ${formatTimestampForUser(params.observedAt, params.timezone)}`,
    "",
    "Ini adalah notifikasi harga, bukan rekomendasi transaksi.",
  ].join("\n");
}

export function formatSystemStatusMessage(status: SystemStatusSnapshot, timezone: string): string {
  const lines: string[] = [
    "🩺 DARFIN MARKET - STATUS LAYANAN",
    "",
    `Bot      : ${status.botOk ? "OK" : "DOWN"}`,
    `Database : ${status.dbOk ? "OK" : "DOWN"}`,
    `Redis    : ${status.redisOk ? "OK" : "DOWN"}`,
    `Cache    : ${status.cacheStats.hits} hit / ${status.cacheStats.misses} miss / ${status.cacheStats.staleHits} stale`,
    "",
    "PROVIDERS",
  ];

  for (const p of status.providers) {
    const icon =
      p.status === "healthy"
        ? "🟢"
        : p.status === "degraded"
          ? "🟡"
          : p.status === "unconfigured"
            ? "⚪"
            : "🔴";
    const latency = p.latencyMs !== undefined ? ` (${p.latencyMs}ms)` : "";
    const lastOk = p.lastSuccessAt
      ? ` | ok: ${formatTimestampForUser(p.lastSuccessAt, timezone)}`
      : "";
    const detail = p.detail ? ` - ${p.detail}` : "";
    lines.push(`${icon} ${p.provider}: ${p.status}${latency}${lastOk}${detail}`);
  }

  if (status.quotas.length > 0) {
    lines.push("");
    lines.push("KUOTA API");
    for (const q of status.quotas) {
      lines.push(`• ${q.provider} (${q.period}): ${q.used}/${q.limit} (${q.percent}%)`);
    }
  }

  return lines.join("\n");
}
