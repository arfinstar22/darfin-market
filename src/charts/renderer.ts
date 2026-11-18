import { Resvg } from "@resvg/resvg-js";
import type { ChartSeries } from "../types/market.js";
import { toDecimal } from "../utils/decimal.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatAxisPrice(value: number, currency: string): string {
  if (currency === "IDR") {
    if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(2)}M`;
    if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(2)}jt`;
    return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
  }
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

export function buildChartSvg(series: ChartSeries): string {
  const width = 920;
  const height = 500;
  const padLeft = 105;
  const padRight = 32;
  const padTop = 78;
  const padBottom = 78;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const values = series.points.map((p) => Number(toDecimal(p.price).toFixed(8)));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const spread = maxVal - minVal || Math.abs(maxVal) * 0.02 || 1;
  const yMin = minVal - spread * 0.08;
  const yMax = maxVal + spread * 0.08;

  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const isUp = last >= first;
  const strokeColor = isUp ? "#22c55e" : "#ef4444";
  const fillColor = isUp ? "#22c55e" : "#ef4444";

  const coords = values.map((val, idx) => {
    const x =
      values.length === 1
        ? padLeft + plotW / 2
        : padLeft + (idx / (values.length - 1)) * plotW;
    const y = padTop + ((yMax - val) / (yMax - yMin)) * plotH;
    return { x, y };
  });

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath =
    coords.length > 0
      ? `M ${coords[0]!.x.toFixed(1)} ${(padTop + plotH).toFixed(1)} ` +
        coords.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ") +
        ` L ${coords[coords.length - 1]!.x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : "";

  const gridLines: string[] = [];
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const ratio = i / yTicks;
    const y = padTop + ratio * plotH;
    const val = yMax - ratio * (yMax - yMin);
    gridLines.push(
      `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="#1e293b" stroke-width="1" />`,
    );
    gridLines.push(
      `<text x="${padLeft - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#94a3b8" font-size="12" font-family="DejaVu Sans, sans-serif">${escapeXml(formatAxisPrice(val, series.quoteCurrency))}</text>`,
    );
  }

  const pctDelta = first > 0 ? ((last - first) / first) * 100 : 0;
  const deltaSign = pctDelta >= 0 ? "+" : "";
  const title = `${series.symbol}/${series.quoteCurrency} (${series.range.toUpperCase()})`;
  const subtitle = `${formatAxisPrice(last, series.quoteCurrency)}   ${deltaSign}${pctDelta.toFixed(2)}%`;
  const startLabel = series.startedAt.slice(0, 16).replace("T", " ") + " UTC";
  const endLabel = series.endedAt.slice(0, 16).replace("T", " ") + " UTC";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${fillColor}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${fillColor}" stop-opacity="0.01"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#0b1120"/>
  <text x="28" y="34" fill="#f8fafc" font-size="22" font-weight="700" font-family="DejaVu Sans, sans-serif">DARFIN MARKET - ${escapeXml(title)}</text>
  <text x="28" y="58" fill="${strokeColor}" font-size="16" font-weight="600" font-family="DejaVu Sans, sans-serif">${escapeXml(subtitle)}</text>
  ${gridLines.join("\n  ")}
  <path d="${areaPath}" fill="url(#areaGrad)"/>
  <polyline fill="none" stroke="${strokeColor}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" points="${polylinePoints}"/>
  <text x="${padLeft}" y="${height - 44}" fill="#94a3b8" font-size="12" font-family="DejaVu Sans, sans-serif">${escapeXml(startLabel)}</text>
  <text x="${width - padRight}" y="${height - 44}" text-anchor="end" fill="#94a3b8" font-size="12" font-family="DejaVu Sans, sans-serif">${escapeXml(endLabel)}</text>
  <text x="28" y="${height - 16}" fill="#64748b" font-size="12" font-family="DejaVu Sans, sans-serif">${escapeXml(series.sourceNote)}</text>
</svg>`;
}

export function renderChartPng(series: ChartSeries): Buffer {
  const svg = buildChartSvg(series);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 920 },
  });
  return Buffer.from(resvg.render().asPng());
}
