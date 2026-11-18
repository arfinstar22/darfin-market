const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.("#090C12");
  tg.setBackgroundColor?.("#090C12");
}

const initData = tg?.initData ?? "";

const state = {
  activeTab: "stocks",
  stockMarket: "idx", // idx | us
  selectedAsset: {
    symbol: "BBCA",
    lookupKey: "BBCA:IDX",
    name: "Bank Central Asia Tbk",
    assetClass: "stock",
    currency: "IDR",
    exchange: "IDX",
  },
  chartRange: "7d",
  chartPoints: [],
  stocksItems: [],
  previousPrices: new Map(),
  cryptoData: null,
  moverDir: "gainers",
  eventSource: null,
};

function haptic(style = "light") {
  try {
    tg?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    // ignore outside Telegram
  }
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add("hidden"), 3000);
}

function formatPrice(val, currency = "IDR") {
  if (val === null || val === undefined || val === "") return "-";
  const num = Number(val);
  if (!Number.isFinite(num)) return "-";
  const c = (currency || "USD").toUpperCase();
  if (c === "IDR") {
    const maxFrac = Math.abs(num) >= 100 ? 0 : 2;
    return `Rp ${num.toLocaleString("id-ID", { maximumFractionDigits: maxFrac })}`;
  }
  const maxFrac = Math.abs(num) >= 1 ? 2 : 4;
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: Math.abs(num) >= 1 ? 2 : 0,
    maximumFractionDigits: maxFrac,
  });
  if (c === "USD") return `$${formatted}`;
  if (c === "EUR") return `€${formatted}`;
  if (c === "GBP") return `£${formatted}`;
  if (c === "JPY") return `¥${Math.round(num).toLocaleString("en-US")}`;
  return `${formatted} ${c}`;
}

function formatCompactUsd(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return "-";
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return formatPrice(num, "USD");
}

function formatPercent(val) {
  if (val === null || val === undefined || val === "") return "0.00%";
  const num = Number(val);
  if (!Number.isFinite(num)) return "-";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function formatTimeLocal(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function apiFetch(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(initData ? { "X-Telegram-Init-Data": initData } : {}),
    ...(options.headers ?? {}),
  };
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({ ok: false, error: "Respon server tidak valid." }));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// =========================================================================
// Interactive Canvas Line Chart with Touch/Mouse Crosshair Scrubber
// =========================================================================
function drawChart(points, currency, hoverIndex = -1) {
  const canvas = document.getElementById("priceChartCanvas");
  const emptyEl = document.getElementById("chartEmptyState");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 280);
  const h = Math.max(rect.height, 180);

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (!points || points.length < 2) {
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  const values = points.map((p) => Number(p.price));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const spread = maxVal - minVal || Math.abs(maxVal) * 0.02 || 1;
  const yMin = minVal - spread * 0.1;
  const yMax = maxVal + spread * 0.1;

  const padL = 12;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const isUp = values[values.length - 1] >= values[0];
  const stroke = isUp ? "#16C784" : "#EA3943";

  // Subtle horizontal grid
  ctx.strokeStyle = "#1d2638";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padT + (i / 3) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  const coords = values.map((v, i) => ({
    x: padL + (i / (values.length - 1)) * plotW,
    y: padT + ((yMax - v) / (yMax - yMin)) * plotH,
  }));

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, isUp ? "rgba(22,199,132,0.28)" : "rgba(234,57,67,0.28)");
  grad.addColorStop(1, "rgba(9,12,18,0.01)");

  ctx.beginPath();
  ctx.moveTo(coords[0].x, padT + plotH);
  coords.forEach((c) => ctx.lineTo(c.x, c.y));
  ctx.lineTo(coords[coords.length - 1].x, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  coords.forEach((c, idx) => (idx === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Min / Max annotations
  ctx.fillStyle = "#64748B";
  ctx.font = '10px "Fira Code", monospace';
  ctx.fillText(formatPrice(maxVal, currency), padL + 2, padT + 10);
  ctx.fillText(formatPrice(minVal, currency), padL + 2, h - 6);

  // Crosshair on scrub
  if (hoverIndex >= 0 && hoverIndex < coords.length) {
    const pt = coords[hoverIndex];
    ctx.strokeStyle = "rgba(56,189,248,0.65)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pt.x, padT);
    ctx.lineTo(pt.x, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = stroke;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#F8FAFC";
    ctx.stroke();
  }
}

function setupChartScrubber() {
  const canvas = document.getElementById("priceChartCanvas");
  const scrubPrice = document.getElementById("scrubPrice");
  const scrubTime = document.getElementById("scrubTime");

  const handlePointer = (clientX) => {
    if (!state.chartPoints.length) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (state.chartPoints.length - 1));
    const pt = state.chartPoints[idx];
    if (!pt) return;
    scrubPrice.textContent = formatPrice(pt.price, state.selectedAsset.currency);
    scrubTime.textContent = new Date(pt.timestamp).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    drawChart(state.chartPoints, state.selectedAsset.currency, idx);
  };

  const resetScrub = () => {
    scrubPrice.textContent = "Geser grafik untuk melihat titik harga";
    scrubTime.textContent = "";
    drawChart(state.chartPoints, state.selectedAsset.currency, -1);
  };

  canvas.addEventListener("pointermove", (e) => handlePointer(e.clientX));
  canvas.addEventListener("pointerdown", (e) => handlePointer(e.clientX));
  canvas.addEventListener("pointerleave", resetScrub);
  canvas.addEventListener("pointerup", resetScrub);
}

// =========================================================================
// Asset Detail + Chart Loader
// =========================================================================
function renderDetailTicker(ticker, fallbackMeta) {
  const sym = ticker?.symbol ?? fallbackMeta.symbol;
  const ex = ticker?.exchange ?? fallbackMeta.exchange ?? (fallbackMeta.assetClass === "crypto" ? "CRYPTO" : "STOCK");
  const curr = ticker?.quoteCurrency ?? fallbackMeta.currency ?? "USD";

  state.selectedAsset = {
    symbol: sym,
    lookupKey: ticker?.assetId ?? fallbackMeta.lookupKey ?? sym,
    name: ticker?.name ?? fallbackMeta.name ?? sym,
    assetClass: ticker?.assetClass ?? fallbackMeta.assetClass ?? "stock",
    currency: curr,
    exchange: ex,
  };

  document.getElementById("detailSymbol").textContent = sym;
  document.getElementById("detailExchange").textContent = ex;
  document.getElementById("detailName").textContent = state.selectedAsset.name;

  const marketPill = document.getElementById("detailMarketState");
  if (ticker?.isMarketOpen !== undefined) {
    marketPill.classList.remove("hidden");
    marketPill.classList.toggle("open", ticker.isMarketOpen);
    marketPill.textContent = ticker.isMarketOpen ? "BUKA" : "TUTUP";
  } else {
    marketPill.classList.add("hidden");
  }

  document.getElementById("detailPrice").textContent = ticker ? formatPrice(ticker.price, curr) : "-";

  const chEl = document.getElementById("detailChange");
  if (ticker?.change24hPercent !== undefined) {
    const pctNum = Number(ticker.change24hPercent);
    chEl.className = `detail-change mono ${pctNum > 0 ? "up" : pctNum < 0 ? "down" : ""}`;
    const absText = ticker.change24h ? `${formatPrice(ticker.change24h, curr)} ` : "";
    chEl.textContent = `${absText}(${formatPercent(ticker.change24hPercent)})`;
  } else {
    chEl.className = "detail-change mono";
    chEl.textContent = "-";
  }

  document.getElementById("metricOpen").textContent = ticker?.open ? formatPrice(ticker.open, curr) : "-";
  document.getElementById("metricHigh").textContent = ticker?.high24h ? formatPrice(ticker.high24h, curr) : "-";
  document.getElementById("metricLow").textContent = ticker?.low24h ? formatPrice(ticker.low24h, curr) : "-";
  document.getElementById("metricPrev").textContent = ticker?.previousClose
    ? formatPrice(ticker.previousClose, curr)
    : ticker?.buy
      ? formatPrice(ticker.buy, curr)
      : "-";

  document.getElementById("detailSource").textContent = ticker?.sourceLabel ?? "Sumber belum aktif";
  document.getElementById("detailTime").textContent = ticker
    ? formatTimeLocal(ticker.sourceUpdatedAt ?? ticker.fetchedAt)
    : "-";
}

async function loadChartForSelected() {
  const emptyEl = document.getElementById("chartEmptyState");
  emptyEl.textContent = "Memuat grafik...";
  emptyEl.classList.remove("hidden");
  state.chartPoints = [];

  try {
    const data = await apiFetch(
      `/api/chart?symbol=${encodeURIComponent(state.selectedAsset.lookupKey)}&range=${encodeURIComponent(state.chartRange)}`,
    );
    state.chartPoints = data.series.points ?? [];
    drawChart(state.chartPoints, data.series.quoteCurrency || state.selectedAsset.currency);
    if (data.series.sourceNote) {
      document.getElementById("detailSource").textContent = data.series.sourceNote;
    }
  } catch (err) {
    emptyEl.textContent = err.message || "Data grafik belum tersedia untuk rentang ini.";
    drawChart([], state.selectedAsset.currency);
  }
}

async function selectAsset(meta) {
  haptic("light");
  if (meta.assetClass === "stock") {
    try {
      const data = await apiFetch(`/api/stock/${encodeURIComponent(meta.lookupKey || meta.symbol)}`);
      renderDetailTicker(data.result.ticker, meta);
      if (data.result.unconfiguredHint) {
        const banner = document.getElementById("stockConfigBanner");
        banner.textContent = data.result.unconfiguredHint;
        banner.classList.remove("hidden");
      }
    } catch {
      renderDetailTicker(null, meta);
    }
  } else {
    try {
      const data = await apiFetch(`/api/crypto/${encodeURIComponent(meta.symbol)}`);
      const t = data.result.indodaxTicker ?? data.result.globalTicker;
      renderDetailTicker(t, meta);
    } catch {
      renderDetailTicker(null, meta);
    }
  }
  highlightSelectedRow();
  await loadChartForSelected();
}

function highlightSelectedRow() {
  document.querySelectorAll(".ticker-row[data-key]").forEach((el) => {
    el.classList.toggle("selected", el.dataset.key === state.selectedAsset.lookupKey);
  });
}

// =========================================================================
// Stocks Tab + Live SSE Stream
// =========================================================================
async function loadStocksTab() {
  const listEl = document.getElementById("stocksList");
  const titleEl = document.getElementById("stocksListTitle");
  const banner = document.getElementById("stockConfigBanner");

  titleEl.textContent =
    state.stockMarket === "idx"
      ? "Saham Populer Indonesia (IDX)"
      : "Saham Populer Internasional (US)";
  listEl.innerHTML = `<div class="empty-state">Memuat harga saham...</div>`;

  try {
    const data = await apiFetch(`/api/stocks?market=${state.stockMarket}`);
    state.stocksItems = data.items ?? [];

    if (data.unconfiguredHint) {
      banner.textContent = data.unconfiguredHint;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }

    renderStocksList(state.stocksItems);
    document.getElementById("lastSyncText").textContent = `Update ${formatTimeLocal(data.updatedAt)}`;

    // Select first stock in current market if selected asset belongs to another market
    const currentInList = state.stocksItems.find(
      (i) => i.lookupKey === state.selectedAsset.lookupKey,
    );
    const target = currentInList ?? state.stocksItems[0];
    if (target) {
      renderDetailTicker(target.ticker, {
        symbol: target.symbol,
        lookupKey: target.lookupKey,
        name: target.name,
        assetClass: "stock",
        currency: target.currency,
        exchange: target.exchange,
      });
      highlightSelectedRow();
      void loadChartForSelected();
    }

    connectLiveStream();
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

function renderStocksList(items) {
  const listEl = document.getElementById("stocksList");
  listEl.innerHTML = "";

  for (const item of items) {
    const t = item.ticker;
    const prev = state.previousPrices.get(item.lookupKey);
    const currPrice = t ? Number(t.price) : null;
    let flashClass = "";
    if (prev !== undefined && currPrice !== null && currPrice !== prev) {
      flashClass = currPrice > prev ? "flash-up" : "flash-down";
    }
    if (currPrice !== null) {
      state.previousPrices.set(item.lookupKey, currPrice);
    }

    const pctNum = t?.change24hPercent !== undefined ? Number(t.change24hPercent) : null;
    const pillClass = pctNum === null ? "flat" : pctNum > 0 ? "up" : pctNum < 0 ? "down" : "flat";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ticker-row ${flashClass} ${item.lookupKey === state.selectedAsset.lookupKey ? "selected" : ""}`;
    btn.dataset.key = item.lookupKey;
    btn.innerHTML = `
      <div class="ticker-left">
        <div class="ticker-sym-line">
          <span class="ticker-sym">${item.symbol}</span>
          <span class="ticker-badge">${item.exchange}</span>
        </div>
        <div class="ticker-sub">${item.name}</div>
      </div>
      <div class="ticker-right">
        <div class="ticker-price mono">${t ? formatPrice(t.price, t.quoteCurrency) : "-"}</div>
        <span class="change-pill mono ${pillClass}">${pctNum !== null ? formatPercent(pctNum) : "API key"}</span>
      </div>
    `;

    btn.addEventListener("click", () => {
      void selectAsset({
        symbol: item.symbol,
        lookupKey: item.lookupKey,
        name: item.name,
        assetClass: "stock",
        currency: item.currency,
        exchange: item.exchange,
      });
      document.getElementById("stockDetailCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    listEl.appendChild(btn);
  }
}

function connectLiveStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  const badge = document.getElementById("streamBadge");
  const label = document.getElementById("streamLabel");

  const type = state.activeTab === "crypto" ? "crypto" : "stock";
  const symbols =
    type === "stock"
      ? state.stocksItems.slice(0, 8).map((i) => i.lookupKey).join(",")
      : "BTC,ETH,SOL,USDT";

  const es = new EventSource(`/api/stream?type=${type}&symbols=${encodeURIComponent(symbols)}`);
  state.eventSource = es;

  es.onopen = () => {
    badge.classList.add("connected");
    label.textContent = "LIVE";
  };

  es.addEventListener("tick", (event) => {
    try {
      const payload = JSON.parse(event.data);
      document.getElementById("lastSyncText").textContent = `Live ${formatTimeLocal(payload.ts)}`;

      if (type === "stock" && Array.isArray(payload.ticks) && payload.ticks.length > 0) {
        const map = new Map(payload.ticks.map((t) => [t.assetId, t]));
        state.stocksItems = state.stocksItems.map((item) => {
          const fresh = map.get(item.lookupKey) ?? map.get(item.symbol);
          return fresh ? { ...item, ticker: fresh } : item;
        });
        renderStocksList(state.stocksItems);

        const activeFresh =
          map.get(state.selectedAsset.lookupKey) ?? map.get(state.selectedAsset.symbol);
        if (activeFresh) {
          renderDetailTicker(activeFresh, state.selectedAsset);
        }
      } else if (type === "crypto" && Array.isArray(payload.ticks) && state.cryptoData) {
        state.cryptoData.indodax = payload.ticks;
        renderIndodaxList(payload.ticks);
      }
    } catch {
      // ignore malformed tick
    }
  });

  es.onerror = () => {
    badge.classList.remove("connected");
    label.textContent = "SYNC";
  };
}

// =========================================================================
// Crypto Tab
// =========================================================================
async function loadCryptoTab() {
  const indodaxEl = document.getElementById("indodaxList");
  indodaxEl.innerHTML = `<div class="empty-state">Memuat pasar crypto...</div>`;

  try {
    const data = await apiFetch("/api/crypto");
    state.cryptoData = data;

    if (data.global) {
      document.getElementById("kpiMarketCap").textContent = formatCompactUsd(data.global.marketCapUsd);
      document.getElementById("kpiVolume").textContent = formatCompactUsd(data.global.volume24hUsd);
      document.getElementById("kpiBtcDom").textContent = `${Number(data.global.btcDominancePercent).toFixed(1)}%`;
    }

    renderIndodaxList(data.indodax ?? []);
    renderMoversList();
    connectLiveStream();
  } catch (err) {
    indodaxEl.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

function renderIndodaxList(tickers) {
  const el = document.getElementById("indodaxList");
  el.innerHTML = "";
  if (!tickers.length) {
    el.innerHTML = `<div class="empty-state">INDODAX sedang tidak tersedia.</div>`;
    return;
  }

  for (const t of tickers) {
    const pctNum = t.change24hPercent !== undefined ? Number(t.change24hPercent) : null;
    const pillClass = pctNum === null ? "flat" : pctNum > 0 ? "up" : pctNum < 0 ? "down" : "flat";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ticker-row";
    row.innerHTML = `
      <div class="ticker-left">
        <div class="ticker-sym-line">
          <span class="ticker-sym">${t.symbol}/IDR</span>
          <span class="ticker-badge">INDODAX</span>
        </div>
        <div class="ticker-sub">${t.name ?? t.symbol}</div>
      </div>
      <div class="ticker-right">
        <div class="ticker-price mono">${formatPrice(t.price, "IDR")}</div>
        <span class="change-pill mono ${pillClass}">${pctNum !== null ? formatPercent(pctNum) : "24h"}</span>
      </div>
    `;
    row.addEventListener("click", () => {
      switchTab("stocks");
      void selectAsset({
        symbol: t.symbol,
        lookupKey: t.symbol,
        name: t.name ?? t.symbol,
        assetClass: "crypto",
        currency: "IDR",
        exchange: "INDODAX",
      });
    });
    el.appendChild(row);
  }
}

function renderMoversList() {
  const el = document.getElementById("moversList");
  el.innerHTML = "";
  const list =
    state.moverDir === "gainers" ? state.cryptoData?.gainers ?? [] : state.cryptoData?.losers ?? [];

  if (!list.length) {
    el.innerHTML = `<div class="empty-state">Data movers belum tersedia.</div>`;
    return;
  }

  for (const t of list) {
    const pctNum = Number(t.change24hPercent);
    const pillClass = pctNum > 0 ? "up" : pctNum < 0 ? "down" : "flat";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ticker-row";
    row.innerHTML = `
      <div class="ticker-left">
        <div class="ticker-sym-line">
          <span class="ticker-sym">${t.symbol}</span>
          <span class="ticker-badge">GLOBAL</span>
        </div>
        <div class="ticker-sub">${t.name ?? t.symbol}</div>
      </div>
      <div class="ticker-right">
        <div class="ticker-price mono">${formatPrice(t.price, "USD")}</div>
        <span class="change-pill mono ${pillClass}">${formatPercent(pctNum)}</span>
      </div>
    `;
    row.addEventListener("click", () => {
      switchTab("stocks");
      void selectAsset({
        symbol: t.symbol,
        lookupKey: t.assetId,
        name: t.name ?? t.symbol,
        assetClass: "crypto",
        currency: "USD",
        exchange: "COINPAPRIKA",
      });
    });
    el.appendChild(row);
  }
}

// =========================================================================
// FX Tab
// =========================================================================
async function loadFxTab() {
  const listEl = document.getElementById("fxRatesList");
  listEl.innerHTML = `<div class="empty-state">Memuat kurs referensi...</div>`;
  try {
    const data = await apiFetch("/api/fx?base=USD");
    const rates = data.rates ?? [];
    document.getElementById("fxRefDate").textContent = rates[0]?.referenceDate ?? "-";
    listEl.innerHTML = "";
    for (const r of rates) {
      const div = document.createElement("div");
      div.className = "personal-card";
      div.innerHTML = `
        <div>
          <div class="ticker-sym">1 ${r.base} -> ${r.quote}</div>
          <div class="ticker-sub">Referensi ${r.referenceDate}</div>
        </div>
        <div class="ticker-price mono">${formatPrice(r.rate, r.quote)}</div>
      `;
      listEl.appendChild(div);
    }
    await runFxConversion();
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

async function runFxConversion() {
  const amount = document.getElementById("fxAmount").value.trim();
  const from = document.getElementById("fxFrom").value;
  const to = document.getElementById("fxTo").value;
  if (!amount) return;

  try {
    const data = await apiFetch(
      `/api/convert?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    const c = data.conversion;
    document.getElementById("fxResultValue").textContent =
      `${c.amount} ${c.base} = ${formatPrice(c.convertedAmount, c.quote)}`;
    document.getElementById("fxResultRate").textContent =
      `Kurs 1 ${c.base} = ${formatPrice(c.rate, c.quote)} | Ref ${c.referenceDate}`;
  } catch (err) {
    document.getElementById("fxResultValue").textContent = err.message;
    document.getElementById("fxResultRate").textContent = "";
  }
}

// =========================================================================
// Personal Watchlist & Alerts Tab (Telegram Authenticated)
// =========================================================================
async function loadPersonalTab() {
  const authNotice = document.getElementById("authNotice");
  const wlEl = document.getElementById("watchlistContainer");
  const alEl = document.getElementById("alertsContainer");

  if (!initData) {
    authNotice.classList.remove("hidden");
    wlEl.innerHTML = `<div class="empty-state">Mode preview browser: buka dari Telegram Bot untuk sinkronisasi akun.</div>`;
    alEl.innerHTML = `<div class="empty-state">Price alerts aktif saat dibuka lewat bot Telegram.</div>`;
    return;
  }

  authNotice.classList.add("hidden");
  wlEl.innerHTML = `<div class="empty-state">Memuat watchlist...</div>`;
  alEl.innerHTML = `<div class="empty-state">Memuat alerts...</div>`;

  try {
    const [wlRes, alRes] = await Promise.all([
      apiFetch("/api/watchlist"),
      apiFetch("/api/alerts"),
    ]);

    const items = wlRes.items ?? [];
    document.getElementById("watchlistCount").textContent = `${items.length} aset`;
    wlEl.innerHTML = "";
    if (!items.length) {
      wlEl.innerHTML = `<div class="empty-state">Watchlist masih kosong. Tekan "+ Watchlist" pada saham atau crypto.</div>`;
    } else {
      for (const entry of items) {
        const t = entry.ticker;
        const card = document.createElement("div");
        card.className = "personal-card";
        card.innerHTML = `
          <div>
            <div class="ticker-sym">${entry.row.symbol}/${entry.row.quoteCurrency}</div>
            <div class="ticker-sub">${entry.row.provider.toUpperCase()} | ${t ? formatPrice(t.price, t.quoteCurrency) : "N/A"}</div>
          </div>
          <div class="personal-actions">
            <button type="button" class="chip-btn danger" data-rm-wl="${entry.row.id}">Hapus</button>
          </div>
        `;
        card.querySelector("[data-rm-wl]").addEventListener("click", async () => {
          await apiFetch(`/api/watchlist/${encodeURIComponent(entry.row.id)}`, { method: "DELETE" });
          showToast(`${entry.row.symbol} dihapus dari watchlist`);
          void loadPersonalTab();
        });
        wlEl.appendChild(card);
      }
    }

    const alerts = alRes.alerts ?? [];
    document.getElementById("alertsCount").textContent = `${alerts.length} alert`;
    alEl.innerHTML = "";
    if (!alerts.length) {
      alEl.innerHTML = `<div class="empty-state">Belum ada alert harga. Tekan "Pasang Alert" pada saham atau crypto.</div>`;
    } else {
      for (const a of alerts) {
        const cond = a.condition === "above" ? "di atas" : "di bawah";
        const card = document.createElement("div");
        card.className = "personal-card";
        card.innerHTML = `
          <div>
            <div class="ticker-sym">${a.symbol}/${a.quoteCurrency} ${cond} ${formatPrice(a.targetPrice, a.quoteCurrency)}</div>
            <div class="ticker-sub">${a.provider.toUpperCase()} | Status: ${a.status}</div>
          </div>
          <div class="personal-actions">
            <button type="button" class="chip-btn" data-toggle-al="${a.id}">${a.status === "active" ? "Jeda" : "Aktifkan"}</button>
            <button type="button" class="chip-btn danger" data-del-al="${a.id}">Hapus</button>
          </div>
        `;
        card.querySelector("[data-toggle-al]").addEventListener("click", async () => {
          const action = a.status === "active" ? "pause" : "resume";
          await apiFetch(`/api/alerts/${encodeURIComponent(a.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ action }),
          });
          showToast(`Alert ${action === "pause" ? "dijeda" : "diaktifkan"}`);
          void loadPersonalTab();
        });
        card.querySelector("[data-del-al]").addEventListener("click", async () => {
          await apiFetch(`/api/alerts/${encodeURIComponent(a.id)}`, { method: "DELETE" });
          showToast("Alert dihapus");
          void loadPersonalTab();
        });
        alEl.appendChild(card);
      }
    }
  } catch (err) {
    wlEl.innerHTML = `<div class="empty-state">${err.message}</div>`;
    alEl.innerHTML = "";
  }
}

// =========================================================================
// Search + Modals + Navigation
// =========================================================================
function setupSearch() {
  const input = document.getElementById("searchInput");
  const clearBtn = document.getElementById("searchClearBtn");
  const dropdown = document.getElementById("searchResults");
  let timer = null;

  const closeDropdown = () => dropdown.classList.add("hidden");

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearBtn.classList.toggle("hidden", q.length === 0);
    clearTimeout(timer);
    if (q.length < 1) {
      closeDropdown();
      return;
    }
    timer = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
        const results = data.results ?? [];
        dropdown.innerHTML = "";
        if (!results.length) {
          dropdown.innerHTML = `<div class="empty-state">Tidak ditemukan hasil untuk "${q}".</div>`;
        } else {
          for (const r of results) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "search-item";
            btn.innerHTML = `
              <div>
                <div class="ticker-sym">${r.symbol} <span class="ticker-badge">${r.exchange ?? r.assetClass.toUpperCase()}</span></div>
                <div class="ticker-sub">${r.name}</div>
              </div>
              <span class="section-meta">${r.currency ?? ""}</span>
            `;
            btn.addEventListener("click", () => {
              closeDropdown();
              input.value = "";
              clearBtn.classList.add("hidden");
              switchTab("stocks");
              void selectAsset({
                symbol: r.symbol,
                lookupKey: r.assetId,
                name: r.name,
                assetClass: r.assetClass,
                currency: r.currency ?? (r.market === "IDX" ? "IDR" : "USD"),
                exchange: r.exchange ?? r.market ?? r.assetClass.toUpperCase(),
              });
            });
            dropdown.appendChild(btn);
          }
        }
        dropdown.classList.remove("hidden");
      } catch {
        closeDropdown();
      }
    }, 280);
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.classList.add("hidden");
    closeDropdown();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) closeDropdown();
  });
}

function switchTab(tab) {
  haptic("light");
  state.activeTab = tab;
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
  document.getElementById(`panel-${tab}`).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  if (tab === "stocks") void loadStocksTab();
  else if (tab === "crypto") void loadCryptoTab();
  else if (tab === "fx") void loadFxTab();
  else if (tab === "personal") void loadPersonalTab();
}

function setupControls() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      state.stockMarket = btn.dataset.market;
      document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
      void loadStocksTab();
    });
  });

  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      state.chartRange = btn.dataset.range;
      document.querySelectorAll(".range-btn").forEach((b) => b.classList.toggle("active", b === btn));
      void loadChartForSelected();
    });
  });

  document.querySelectorAll(".mini-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.moverDir = btn.dataset.mover;
      document.querySelectorAll(".mini-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderMoversList();
    });
  });

  document.getElementById("refreshBtn").addEventListener("click", () => {
    haptic("medium");
    if (state.activeTab === "stocks") void loadStocksTab();
    else if (state.activeTab === "crypto") void loadCryptoTab();
    else if (state.activeTab === "fx") void loadFxTab();
    else void loadPersonalTab();
  });

  document.getElementById("fxConvertBtn").addEventListener("click", () => void runFxConversion());
  document.getElementById("fxSwapBtn").addEventListener("click", () => {
    const fromEl = document.getElementById("fxFrom");
    const toEl = document.getElementById("fxTo");
    const tmp = fromEl.value;
    fromEl.value = toEl.value;
    toEl.value = tmp;
    void runFxConversion();
  });

  // Watchlist button
  document.getElementById("btnAddWatchlist").addEventListener("click", async () => {
    haptic("medium");
    try {
      const res = await apiFetch("/api/watchlist", {
        method: "POST",
        body: JSON.stringify({
          symbol: state.selectedAsset.lookupKey,
          mode: state.selectedAsset.assetClass,
        }),
      });
      showToast(
        res.created
          ? `${state.selectedAsset.symbol} ditambahkan ke watchlist`
          : `${state.selectedAsset.symbol} sudah ada di watchlist`,
      );
    } catch (err) {
      showToast(err.message);
    }
  });

  // Alert Modal
  const modal = document.getElementById("alertModal");
  document.getElementById("btnOpenAlertModal").addEventListener("click", () => {
    haptic("light");
    document.getElementById("alertSymbolInput").value = state.selectedAsset.lookupKey;
    document.getElementById("alertCurrencyLabel").textContent = state.selectedAsset.currency;
    document.getElementById("alertTargetInput").value = "";
    modal.classList.remove("hidden");
  });

  document.getElementById("closeAlertModal").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  document.getElementById("alertForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await apiFetch("/api/alerts", {
        method: "POST",
        body: JSON.stringify({
          symbol: state.selectedAsset.lookupKey,
          condition: document.getElementById("alertConditionInput").value,
          targetPrice: document.getElementById("alertTargetInput").value,
          quoteCurrency: state.selectedAsset.currency,
        }),
      });
      modal.classList.add("hidden");
      showToast(`Alert ${state.selectedAsset.symbol} disimpan`);
    } catch (err) {
      showToast(err.message);
    }
  });
}

async function bootstrap() {
  setupChartScrubber();
  setupSearch();
  setupControls();

  // Handle deep-link from Telegram Bot inline buttons: ?asset=BBCA:IDX&type=stock
  const params = new URLSearchParams(window.location.search);
  const deepAsset = params.get("asset");
  const deepType = params.get("type");

  if (deepAsset) {
    if (deepType === "stock" && !deepAsset.includes(":IDX") && !deepAsset.endsWith(".JK")) {
      state.stockMarket = "us";
      document.getElementById("btnMarketIdx").classList.remove("active");
      document.getElementById("btnMarketUs").classList.add("active");
    }
    await loadStocksTab();
    await selectAsset({
      symbol: deepAsset.replace(":IDX", "").replace(".JK", ""),
      lookupKey: deepAsset,
      name: deepAsset,
      assetClass: deepType === "crypto" ? "crypto" : "stock",
      currency: deepAsset.includes(":IDX") || deepAsset.endsWith(".JK") ? "IDR" : "USD",
      exchange: deepAsset.includes(":IDX") ? "IDX" : deepType === "crypto" ? "CRYPTO" : "US",
    });
  } else {
    await loadStocksTab();
  }
}

void bootstrap();
