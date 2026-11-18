const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.("#090C12");
  tg.setBackgroundColor?.("#090C12");
}

const initData = tg?.initData ?? "";
const LOCAL_WATCHLIST_KEY = "darfin_local_watchlist_v1";

const state = {
  activeTab: "stocks",
  stockMarket: "idx", // idx | us
  selectedSector: "Semua",
  usdIdrRate: null,
  usdIdrDate: null,
  selectedAsset: {
    symbol: "BBCA",
    lookupKey: "BBCA:IDX",
    name: "Bank Central Asia Tbk",
    assetClass: "stock",
    currency: "IDR",
    exchange: "IDX",
    sector: "Perbankan",
  },
  chartRange: "7d",
  chartPoints: [],
  selectionSeq: 0,
  stocksItems: [],
  stocksCacheByMarket: { idx: null, us: null },
  tabLoadedAt: { stocks_idx: 0, stocks_us: 0, crypto: 0, fx: 0, personal: 0 },
  pendingRequests: 0,
  previousPrices: new Map(),
  cryptoData: null,
  fxData: null,
  moverDir: "gainers",
  eventSource: null,
};

const TAB_FRESH_MS = 45_000;

function beginLoading() {
  state.pendingRequests += 1;
  document.getElementById("topLoader")?.classList.remove("hidden");
  document.getElementById("refreshBtn")?.classList.add("spinning");
}

function endLoading() {
  state.pendingRequests = Math.max(0, state.pendingRequests - 1);
  if (state.pendingRequests === 0) {
    document.getElementById("topLoader")?.classList.add("hidden");
    document.getElementById("refreshBtn")?.classList.remove("spinning");
  }
}

function renderSkeletonRows(container, count = 5, withFlag = false) {
  if (!container) return;
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push(`
      <div class="skel-row" aria-hidden="true">
        <div class="skel-left">
          ${withFlag ? '<span class="skel skel-flag"></span>' : ""}
          <div class="skel-stack">
            <span class="skel skel-title"></span>
            <span class="skel skel-sub"></span>
          </div>
        </div>
        <div class="skel-right">
          <span class="skel skel-price"></span>
          <span class="skel skel-pill"></span>
        </div>
      </div>
    `);
  }
  container.innerHTML = rows.join("");
}

function getLocalWatchlist() {
  try {
    const raw = localStorage.getItem(LOCAL_WATCHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalWatchlist(items) {
  try {
    localStorage.setItem(LOCAL_WATCHLIST_KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    // ignore storage quota errors
  }
}

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
  const sector = fallbackMeta.sector ?? state.stocksItems.find((i) => i.symbol === sym)?.sector ?? null;

  state.selectedAsset = {
    symbol: sym,
    lookupKey: ticker?.assetId ?? fallbackMeta.lookupKey ?? sym,
    name: ticker?.name ?? fallbackMeta.name ?? sym,
    assetClass: ticker?.assetClass ?? fallbackMeta.assetClass ?? "stock",
    currency: curr,
    exchange: ex,
    sector,
  };

  document.getElementById("detailSymbol").textContent = sym;
  document.getElementById("detailExchange").textContent = ex;
  document.getElementById("detailName").textContent = state.selectedAsset.name;

  const sectorPill = document.getElementById("detailSector");
  if (sector) {
    sectorPill.textContent = sector;
    sectorPill.classList.remove("hidden");
  } else {
    sectorPill.classList.add("hidden");
  }

  const sessionNote = document.getElementById("detailMarketSession");
  if (ticker?.isMarketOpen !== undefined) {
    sessionNote.classList.remove("hidden");
    sessionNote.classList.toggle("open", ticker.isMarketOpen);
    if (ex === "IDX") {
      sessionNote.textContent = ticker.isMarketOpen
        ? "Bursa IDX sedang buka (09:00-16:00 WIB)"
        : "Bursa IDX tutup - menampilkan harga penutupan terakhir";
    } else {
      sessionNote.textContent = ticker.isMarketOpen
        ? "Bursa US sedang buka"
        : "Bursa US tutup - menampilkan harga perdagangan terakhir";
    }
  } else if (state.selectedAsset.assetClass === "crypto") {
    sessionNote.classList.remove("hidden");
    sessionNote.classList.add("open");
    sessionNote.textContent = "Pasar crypto aktif 24 jam setiap hari";
  } else {
    sessionNote.classList.add("hidden");
  }

  document.getElementById("detailPrice").textContent = ticker ? formatPrice(ticker.price, curr) : "-";

  // Auto IDR estimate for USD stocks & USD crypto using Frankfurter reference rate
  const idrEstEl = document.getElementById("detailIdrEst");
  if (ticker && curr === "USD" && state.usdIdrRate && Number(ticker.price) > 0) {
    const estIdr = Number(ticker.price) * state.usdIdrRate;
    idrEstEl.textContent = `≈ ${formatPrice(estIdr, "IDR")} (est. kurs ref)`;
    idrEstEl.classList.remove("hidden");
  } else {
    idrEstEl.classList.add("hidden");
  }

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

  // Visual Daily Range Meter
  const rangeWrap = document.getElementById("dailyRangeWrap");
  const lowNum = ticker?.low24h ? Number(ticker.low24h) : null;
  const highNum = ticker?.high24h ? Number(ticker.high24h) : null;
  const priceNum = ticker?.price ? Number(ticker.price) : null;
  if (lowNum !== null && highNum !== null && priceNum !== null && highNum > lowNum) {
    const posPct = Math.min(100, Math.max(0, ((priceNum - lowNum) / (highNum - lowNum)) * 100));
    rangeWrap.classList.remove("hidden");
    document.getElementById("rangeTrackFill").style.width = `${posPct.toFixed(1)}%`;
    document.getElementById("rangeTrackDot").style.left = `${posPct.toFixed(1)}%`;
    document.getElementById("rangeLowEnd").textContent = `Terendah: ${formatPrice(lowNum, curr)}`;
    document.getElementById("rangeHighEnd").textContent = `Tertinggi: ${formatPrice(highNum, curr)}`;
    document.getElementById("rangeMeterCaption").textContent =
      posPct >= 75
        ? "Mendekati puncak harian"
        : posPct <= 25
          ? "Mendekati dasar harian"
          : "Di tengah rentang harian";
  } else {
    rangeWrap.classList.add("hidden");
  }

  document.getElementById("metricOpen").textContent = ticker?.open ? formatPrice(ticker.open, curr) : "-";
  document.getElementById("metricHigh").textContent = ticker?.high24h ? formatPrice(ticker.high24h, curr) : "-";
  document.getElementById("metricLow").textContent = ticker?.low24h ? formatPrice(ticker.low24h, curr) : "-";

  const prevLabel = document.getElementById("metricPrevLabel");
  if (ticker?.previousClose) {
    prevLabel.textContent = "Tutup Kemarin";
    document.getElementById("metricPrev").textContent = formatPrice(ticker.previousClose, curr);
  } else if (ticker?.buy) {
    prevLabel.textContent = "Harga Beli";
    document.getElementById("metricPrev").textContent = formatPrice(ticker.buy, curr);
  } else {
    prevLabel.textContent = "Tutup Kemarin";
    document.getElementById("metricPrev").textContent = "-";
  }

  document.getElementById("detailSource").textContent = ticker?.sourceLabel ?? "Sumber belum aktif";
  document.getElementById("detailTime").textContent = ticker
    ? formatTimeLocal(ticker.sourceUpdatedAt ?? ticker.fetchedAt)
    : "-";
}

async function loadChartForSelected(expectedSeq = state.selectionSeq) {
  const emptyEl = document.getElementById("chartEmptyState");
  const skelEl = document.getElementById("chartSkeleton");
  emptyEl.classList.add("hidden");
  skelEl?.classList.remove("hidden");
  state.chartPoints = [];
  beginLoading();

  try {
    const data = await apiFetch(
      `/api/chart?symbol=${encodeURIComponent(state.selectedAsset.lookupKey)}&range=${encodeURIComponent(state.chartRange)}`,
    );
    if (expectedSeq !== state.selectionSeq) return;
    skelEl?.classList.add("hidden");
    state.chartPoints = data.series.points ?? [];
    drawChart(state.chartPoints, data.series.quoteCurrency || state.selectedAsset.currency);
    if (data.series.sourceNote) {
      document.getElementById("detailSource").textContent = data.series.sourceNote;
    }
  } catch (err) {
    if (expectedSeq !== state.selectionSeq) return;
    skelEl?.classList.add("hidden");
    emptyEl.textContent = err.message || "Data grafik belum tersedia untuk rentang ini.";
    drawChart([], state.selectedAsset.currency);
  } finally {
    endLoading();
  }
}

async function selectAsset(meta) {
  haptic("light");
  const seq = ++state.selectionSeq;
  beginLoading();

  try {
    if (meta.assetClass === "stock") {
      try {
        const data = await apiFetch(`/api/stock/${encodeURIComponent(meta.lookupKey || meta.symbol)}`);
        if (seq !== state.selectionSeq) return;
        renderDetailTicker(data.result.ticker, meta);
        if (data.result.unconfiguredHint) {
          const banner = document.getElementById("stockConfigBanner");
          banner.textContent = data.result.unconfiguredHint;
          banner.classList.remove("hidden");
        }
      } catch {
        if (seq !== state.selectionSeq) return;
        renderDetailTicker(null, meta);
      }
    } else {
      try {
        const queryKey = meta.exchange === "COINPAPRIKA" ? (meta.lookupKey || meta.symbol) : meta.symbol;
        const data = await apiFetch(`/api/crypto/${encodeURIComponent(queryKey)}`);
        if (seq !== state.selectionSeq) return;
        const t =
          meta.exchange === "COINPAPRIKA"
            ? (data.result.globalTicker ?? data.result.indodaxTicker)
            : (data.result.indodaxTicker ?? data.result.globalTicker);
        renderDetailTicker(t, meta);
      } catch {
        if (seq !== state.selectionSeq) return;
        renderDetailTicker(null, meta);
      }
    }
  } finally {
    endLoading();
  }

  if (seq !== state.selectionSeq) return;
  highlightSelectedRow();
  connectLiveStream();
  await loadChartForSelected(seq);
}

function openAssetInTerminal(meta) {
  switchTab("stocks", { preserveSelection: true });
  void selectAsset(meta);
  if (window.innerWidth < 1024) {
    document.getElementById("stockDetailCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function highlightSelectedRow() {
  document.querySelectorAll(".ticker-row[data-key]").forEach((el) => {
    el.classList.toggle("selected", el.dataset.key === state.selectedAsset.lookupKey);
  });
}

// =========================================================================
// Market Pulse + Sector Filter + Stocks Tab + Live SSE Stream
// =========================================================================
async function loadPulseUsdIdr() {
  try {
    const data = await apiFetch("/api/fx?base=USD");
    const idr = (data.rates ?? []).find((r) => r.quote === "IDR");
    if (idr) {
      state.usdIdrRate = Number(idr.rate);
      state.usdIdrDate = idr.referenceDate;
      document.getElementById("pulseFxVal").textContent = formatPrice(idr.rate, "IDR");
      document.getElementById("pulseFxSub").textContent = `Ref ${idr.referenceDate}`;
    }
  } catch {
    // non-fatal
  }
}

function updateMarketPulse(market, items) {
  const valid = items
    .map((i) => i.ticker?.change24hPercent)
    .filter((v) => v !== undefined && Number.isFinite(Number(v)))
    .map(Number);

  const valEl = document.getElementById(market === "idx" ? "pulseIdxVal" : "pulseUsVal");
  const subEl = document.getElementById(market === "idx" ? "pulseIdxSub" : "pulseUsSub");
  if (!valEl || !subEl) return;

  if (valid.length === 0) {
    valEl.textContent = "-";
    valEl.className = "pulse-val mono";
    return;
  }

  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  const upCount = valid.filter((v) => v > 0).length;
  const downCount = valid.filter((v) => v < 0).length;
  valEl.textContent = `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`;
  valEl.className = `pulse-val mono ${avg > 0 ? "up" : avg < 0 ? "down" : ""}`;
  subEl.textContent = `${upCount} naik · ${downCount} turun`;
}

function renderSectorChips(items) {
  const bar = document.getElementById("sectorFilterBar");
  if (!bar) return;
  const sectors = ["Semua", ...Array.from(new Set(items.map((i) => i.sector).filter(Boolean)))];
  if (!sectors.includes(state.selectedSector)) {
    state.selectedSector = "Semua";
  }
  bar.innerHTML = "";
  for (const sector of sectors) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sector-chip ${sector === state.selectedSector ? "active" : ""}`;
    btn.textContent = sector;
    btn.addEventListener("click", () => {
      haptic("light");
      state.selectedSector = sector;
      renderSectorChips(state.stocksItems);
      renderStocksList(state.stocksItems);
    });
    bar.appendChild(btn);
  }
}

async function loadStocksTab(options = { preserveSelection: false, force: false }) {
  const seqBefore = state.selectionSeq;
  const listEl = document.getElementById("stocksList");
  const titleEl = document.getElementById("stocksListTitle");
  const banner = document.getElementById("stockConfigBanner");
  const market = state.stockMarket;
  const cacheKey = market === "idx" ? "stocks_idx" : "stocks_us";
  const cachedMarket = state.stocksCacheByMarket[market];
  const isFresh =
    !options.force && cachedMarket && Date.now() - state.tabLoadedAt[cacheKey] < TAB_FRESH_MS;

  titleEl.textContent =
    market === "idx"
      ? "Saham Populer Indonesia (IDX)"
      : "Saham Populer Internasional (US)";

  if (cachedMarket) {
    state.stocksItems = cachedMarket.items ?? [];
    updateMarketPulse(market, state.stocksItems);
    renderSectorChips(state.stocksItems);
    renderStocksList(state.stocksItems);
  } else {
    renderSkeletonRows(listEl, 6, false);
  }

  if (isFresh) {
    if (!options.preserveSelection && seqBefore === state.selectionSeq) {
      const currentInList = state.stocksItems.find((i) => i.lookupKey === state.selectedAsset.lookupKey);
      const target = currentInList ?? state.stocksItems[0];
      if (target && (!currentInList || state.selectedAsset.assetClass !== "stock")) {
        const seq = ++state.selectionSeq;
        renderDetailTicker(target.ticker, {
          symbol: target.symbol,
          lookupKey: target.lookupKey,
          name: target.name,
          assetClass: "stock",
          currency: target.currency,
          exchange: target.exchange,
          sector: target.sector,
        });
        highlightSelectedRow();
        void loadChartForSelected(seq);
      }
      connectLiveStream();
    }
    return;
  }

  beginLoading();
  try {
    const data = await apiFetch(`/api/stocks?market=${market}`);
    state.stocksCacheByMarket[market] = data;
    state.tabLoadedAt[cacheKey] = Date.now();
    if (state.stockMarket !== market) return;

    state.stocksItems = data.items ?? [];

    if (data.unconfiguredHint) {
      banner.textContent = data.unconfiguredHint;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }

    updateMarketPulse(market, state.stocksItems);
    renderSectorChips(state.stocksItems);
    renderStocksList(state.stocksItems);
    document.getElementById("lastSyncText").textContent = `Update ${formatTimeLocal(data.updatedAt)}`;

    if (!options.preserveSelection && seqBefore === state.selectionSeq) {
      const currentInList = state.stocksItems.find(
        (i) => i.lookupKey === state.selectedAsset.lookupKey,
      );
      const target = currentInList ?? state.stocksItems[0];
      if (target) {
        const seq = ++state.selectionSeq;
        renderDetailTicker(target.ticker, {
          symbol: target.symbol,
          lookupKey: target.lookupKey,
          name: target.name,
          assetClass: "stock",
          currency: target.currency,
          exchange: target.exchange,
          sector: target.sector,
        });
        highlightSelectedRow();
        void loadChartForSelected(seq);
      }
      connectLiveStream();
    }
  } catch (err) {
    if (!cachedMarket) {
      listEl.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
  } finally {
    endLoading();
  }
}

function renderStocksList(items) {
  const listEl = document.getElementById("stocksList");
  listEl.innerHTML = "";

  const filtered =
    state.selectedSector === "Semua"
      ? items
      : items.filter((i) => i.sector === state.selectedSector);

  for (const item of filtered) {
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
    const sectorSub = item.sector ? `${item.sector} · ${item.name}` : item.name;
    btn.innerHTML = `
      <div class="ticker-left">
        <div class="ticker-sym-line">
          <span class="ticker-sym">${item.symbol}</span>
          <span class="ticker-badge">${item.exchange}</span>
        </div>
        <div class="ticker-sub">${sectorSub}</div>
      </div>
      <div class="ticker-right">
        <div class="ticker-price mono">${t ? formatPrice(t.price, t.quoteCurrency) : "-"}</div>
        <span class="change-pill mono ${pillClass}">${pctNum !== null ? formatPercent(pctNum) : "Memuat"}</span>
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
        sector: item.sector,
      });
      if (window.innerWidth < 1024) {
        document.getElementById("stockDetailCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
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

  const type =
    state.activeTab === "crypto" || state.selectedAsset.assetClass === "crypto"
      ? "crypto"
      : "stock";
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

        if (state.selectedAsset.assetClass === "stock") {
          const activeFresh =
            map.get(state.selectedAsset.lookupKey) ?? map.get(state.selectedAsset.symbol);
          if (activeFresh) {
            renderDetailTicker(activeFresh, state.selectedAsset);
          }
        }
      } else if (type === "crypto" && Array.isArray(payload.ticks)) {
        if (state.cryptoData) {
          state.cryptoData.indodax = payload.ticks;
          if (state.activeTab === "crypto") {
            renderIndodaxList(payload.ticks);
          }
        }
        if (state.selectedAsset.assetClass === "crypto" && state.selectedAsset.exchange === "INDODAX") {
          const match = payload.ticks.find(
            (t) => t.symbol.toUpperCase() === state.selectedAsset.symbol.toUpperCase(),
          );
          if (match) {
            renderDetailTicker(match, state.selectedAsset);
          }
        }
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
async function loadCryptoTab(force = false) {
  const indodaxEl = document.getElementById("indodaxList");
  const moversEl = document.getElementById("moversList");
  const isFresh =
    !force && state.cryptoData && Date.now() - state.tabLoadedAt.crypto < TAB_FRESH_MS;

  if (isFresh) {
    connectLiveStream();
    return;
  }

  if (!state.cryptoData) {
    renderSkeletonRows(indodaxEl, 5, false);
    renderSkeletonRows(moversEl, 5, false);
  }

  beginLoading();
  try {
    const data = await apiFetch("/api/crypto");
    state.cryptoData = data;
    state.tabLoadedAt.crypto = Date.now();

    if (data.global) {
      document.getElementById("kpiMarketCap").textContent = formatCompactUsd(data.global.marketCapUsd);
      document.getElementById("kpiVolume").textContent = formatCompactUsd(data.global.volume24hUsd);
      document.getElementById("kpiBtcDom").textContent = `${Number(data.global.btcDominancePercent).toFixed(1)}%`;
    }

    renderIndodaxList(data.indodax ?? []);
    renderMoversList();
    connectLiveStream();
  } catch (err) {
    if (!state.cryptoData) {
      indodaxEl.innerHTML = `<div class="empty-state">${err.message}</div>`;
      moversEl.innerHTML = "";
    }
  } finally {
    endLoading();
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
      openAssetInTerminal({
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
      openAssetInTerminal({
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
// FX Tab (with crisp SVG country flags for consistent cross-OS rendering)
// =========================================================================
const FX_META = {
  IDR: {
    name: "Rupiah Indonesia",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="10" fill="#CE1126"/><rect y="10" width="28" height="10" fill="#FFFFFF"/></svg>`,
  },
  USD: {
    name: "Dolar Amerika Serikat",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#FFFFFF"/><path fill="#B22234" d="M0 0h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v2H0z"/><rect width="12" height="10" fill="#3C3B6E"/><circle cx="3" cy="2.5" r="0.8" fill="#FFF"/><circle cx="6" cy="2.5" r="0.8" fill="#FFF"/><circle cx="9" cy="2.5" r="0.8" fill="#FFF"/><circle cx="4.5" cy="5" r="0.8" fill="#FFF"/><circle cx="7.5" cy="5" r="0.8" fill="#FFF"/><circle cx="3" cy="7.5" r="0.8" fill="#FFF"/><circle cx="6" cy="7.5" r="0.8" fill="#FFF"/><circle cx="9" cy="7.5" r="0.8" fill="#FFF"/></svg>`,
  },
  EUR: {
    name: "Euro (Uni Eropa)",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#003399"/><circle cx="14" cy="4.5" r="1" fill="#FFCC00"/><circle cx="18" cy="6" r="1" fill="#FFCC00"/><circle cx="19.5" cy="10" r="1" fill="#FFCC00"/><circle cx="18" cy="14" r="1" fill="#FFCC00"/><circle cx="14" cy="15.5" r="1" fill="#FFCC00"/><circle cx="10" cy="14" r="1" fill="#FFCC00"/><circle cx="8.5" cy="10" r="1" fill="#FFCC00"/><circle cx="10" cy="6" r="1" fill="#FFCC00"/></svg>`,
  },
  SGD: {
    name: "Dolar Singapura",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="10" fill="#EF3340"/><rect y="10" width="28" height="10" fill="#FFFFFF"/><circle cx="6.2" cy="5" r="3" fill="#FFFFFF"/><circle cx="7.4" cy="5" r="2.5" fill="#EF3340"/><circle cx="9.2" cy="3.5" r="0.6" fill="#FFF"/><circle cx="10.4" cy="4.8" r="0.6" fill="#FFF"/><circle cx="9.8" cy="6.4" r="0.6" fill="#FFF"/><circle cx="8.2" cy="6.4" r="0.6" fill="#FFF"/><circle cx="7.8" cy="4.8" r="0.6" fill="#FFF"/></svg>`,
  },
  JPY: {
    name: "Yen Jepang",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#FFFFFF"/><circle cx="14" cy="10" r="5.5" fill="#BC002D"/></svg>`,
  },
  GBP: {
    name: "Poundsterling Inggris",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#012169"/><path stroke="#FFF" stroke-width="3.6" d="M0 0l28 20M28 0L0 20"/><path stroke="#C8102E" stroke-width="1.8" d="M0 0l28 20M28 0L0 20"/><path stroke="#FFF" stroke-width="5.2" d="M14 0v20M0 10h28"/><path stroke="#C8102E" stroke-width="3" d="M14 0v20M0 10h28"/></svg>`,
  },
  AUD: {
    name: "Dolar Australia",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#00008B"/><rect width="13" height="9" fill="#012169"/><path stroke="#FFF" stroke-width="2" d="M0 0l13 9M13 0L0 9M6.5 0v9M0 4.5h13"/><path stroke="#C8102E" stroke-width="1" d="M6.5 0v9M0 4.5h13"/><circle cx="21" cy="6" r="1.1" fill="#FFF"/><circle cx="23.5" cy="9.5" r="1.1" fill="#FFF"/><circle cx="19" cy="11" r="1.1" fill="#FFF"/><circle cx="21" cy="15" r="1.3" fill="#FFF"/><circle cx="6.5" cy="14.5" r="1.6" fill="#FFF"/></svg>`,
  },
  MYR: {
    name: "Ringgit Malaysia",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#FFFFFF"/><path fill="#CC0001" d="M0 0h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v2H0z"/><rect width="13" height="10" fill="#010066"/><circle cx="5.4" cy="5" r="3" fill="#FFCC00"/><circle cx="6.5" cy="5" r="2.5" fill="#010066"/><circle cx="9.2" cy="5" r="1.5" fill="#FFCC00"/></svg>`,
  },
  CNY: {
    name: "Yuan Tiongkok",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#DE2910"/><polygon points="5,2.5 5.9,5.3 8.8,5.3 6.5,7 7.4,9.8 5,8.1 2.6,9.8 3.5,7 1.2,5.3 4.1,5.3" fill="#FFDE00"/><circle cx="10.5" cy="3" r="0.8" fill="#FFDE00"/><circle cx="12" cy="5" r="0.8" fill="#FFDE00"/><circle cx="12" cy="7.5" r="0.8" fill="#FFDE00"/><circle cx="10.5" cy="9.5" r="0.8" fill="#FFDE00"/></svg>`,
  },
  KRW: {
    name: "Won Korea Selatan",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#FFFFFF"/><circle cx="14" cy="10" r="4.6" fill="#CD2E3A"/><path d="M9.4 10a4.6 4.6 0 0 0 9.2 0a2.3 2.3 0 0 1-4.6 0a2.3 2.3 0 0 0-4.6 0z" fill="#0047A0"/><path stroke="#000" stroke-width="1.2" d="M4 5l3-2M21 3l3 2M4 15l3 2M21 17l3-2"/></svg>`,
  },
  SAR: {
    name: "Riyal Arab Saudi",
    svg: `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#006C35"/><rect x="6" y="7" width="16" height="2.4" rx="1" fill="#FFFFFF"/><rect x="8" y="12.2" width="12" height="1.4" rx="0.7" fill="#FFFFFF"/></svg>`,
  },
};

function getCurrencyFlagSvg(code) {
  const c = (code || "").toUpperCase();
  if (FX_META[c]) return FX_META[c].svg;
  return `<svg class="flag-svg" viewBox="0 0 28 20"><rect width="28" height="20" fill="#1e293b"/><text x="14" y="13.5" text-anchor="middle" fill="#f8fafc" font-size="8" font-family="monospace">${c.slice(0, 3)}</text></svg>`;
}

function getCurrencyName(code) {
  return FX_META[(code || "").toUpperCase()]?.name ?? code;
}

function updateFxSelectorFlags() {
  const fromEl = document.getElementById("fxFrom");
  const toEl = document.getElementById("fxTo");
  const fromFlag = document.getElementById("fxFromFlag");
  const toFlag = document.getElementById("fxToFlag");
  if (fromFlag && fromEl) fromFlag.innerHTML = getCurrencyFlagSvg(fromEl.value);
  if (toFlag && toEl) toFlag.innerHTML = getCurrencyFlagSvg(toEl.value);
}

async function loadFxTab(force = false) {
  updateFxSelectorFlags();
  const listEl = document.getElementById("fxRatesList");
  const isFresh = !force && state.fxData && Date.now() - state.tabLoadedAt.fx < TAB_FRESH_MS * 4;
  if (isFresh) {
    return;
  }

  if (!state.fxData) {
    renderSkeletonRows(listEl, 6, true);
  }

  beginLoading();
  try {
    const data = await apiFetch("/api/fx?base=USD");
    state.fxData = data;
    state.tabLoadedAt.fx = Date.now();
    const rates = data.rates ?? [];
    document.getElementById("fxRefDate").textContent = rates[0]?.referenceDate ?? "-";
    listEl.innerHTML = "";
    for (const r of rates) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ticker-row";
      btn.innerHTML = `
        <div class="fx-row-left">
          ${getCurrencyFlagSvg(r.quote)}
          <div class="ticker-left">
            <div class="ticker-sym">1 ${r.base} -> ${r.quote}</div>
            <div class="ticker-sub">${getCurrencyName(r.quote)}</div>
          </div>
        </div>
        <div class="ticker-right">
          <div class="ticker-price mono">${formatPrice(r.rate, r.quote)}</div>
          <div class="ticker-sub">Ref ${r.referenceDate}</div>
        </div>
      `;
      btn.addEventListener("click", () => {
        haptic("light");
        document.getElementById("fxFrom").value = r.base;
        const toSel = document.getElementById("fxTo");
        if ([...toSel.options].some((o) => o.value === r.quote)) {
          toSel.value = r.quote;
        }
        updateFxSelectorFlags();
        void runFxConversion();
      });
      listEl.appendChild(btn);
    }
    await runFxConversion();
  } catch (err) {
    if (!state.fxData) {
      listEl.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
  } finally {
    endLoading();
  }
}

async function runFxConversion() {
  updateFxSelectorFlags();
  const amount = document.getElementById("fxAmount").value.trim();
  const from = document.getElementById("fxFrom").value;
  const to = document.getElementById("fxTo").value;
  if (!amount) return;

  try {
    const data = await apiFetch(
      `/api/convert?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    const c = data.conversion;
    document.getElementById("fxResultValue").innerHTML =
      `<span class="fx-result-head">${getCurrencyFlagSvg(c.base)}<span>${c.amount} ${c.base} =</span>${getCurrencyFlagSvg(c.quote)}<span>${formatPrice(c.convertedAmount, c.quote)}</span></span>`;
    document.getElementById("fxResultRate").textContent =
      `Kurs 1 ${c.base} = ${formatPrice(c.rate, c.quote)} | Ref ${c.referenceDate}`;
  } catch (err) {
    document.getElementById("fxResultValue").textContent = err.message;
    document.getElementById("fxResultRate").textContent = "";
  }
}

// =========================================================================
// Personal Watchlist & Alerts Tab (Telegram Cloud + Browser Local Fallback)
// =========================================================================
async function loadPersonalTab() {
  const authNotice = document.getElementById("authNotice");
  const wlEl = document.getElementById("watchlistContainer");
  const alEl = document.getElementById("alertsContainer");

  if (!initData) {
    authNotice.classList.remove("hidden");
    const localItems = getLocalWatchlist();
    document.getElementById("watchlistCount").textContent = `${localItems.length} aset (lokal)`;
    document.getElementById("alertsCount").textContent = "Khusus Telegram";
    alEl.innerHTML = `<div class="empty-state">Price Alerts mengirim notifikasi langsung ke chat Telegram. Buka lewat <strong>@darfinmarketbot</strong> untuk memasang alert harga.</div>`;

    if (!localItems.length) {
      wlEl.innerHTML = `<div class="empty-state">Watchlist masih kosong. Pilih saham atau crypto lalu tekan "+ Watchlist".</div>`;
      return;
    }

    renderSkeletonRows(wlEl, Math.min(localItems.length, 4), false);
    beginLoading();
    const settled = await Promise.all(
      localItems.map(async (item) => {
        try {
          if (item.assetClass === "crypto") {
            const res = await apiFetch(`/api/crypto/${encodeURIComponent(item.symbol)}`);
            return { item, ticker: res.result.indodaxTicker ?? res.result.globalTicker };
          }
          const res = await apiFetch(`/api/stock/${encodeURIComponent(item.lookupKey || item.symbol)}`);
          return { item, ticker: res.result.ticker };
        } catch {
          return { item, ticker: null };
        }
      }),
    );
    endLoading();

    wlEl.innerHTML = "";
    for (const { item, ticker } of settled) {
      const card = document.createElement("div");
      card.className = "personal-card";
      const priceText = ticker ? formatPrice(ticker.price, ticker.quoteCurrency) : "N/A";
      const pctText =
        ticker?.change24hPercent !== undefined ? ` (${formatPercent(ticker.change24hPercent)})` : "";
      card.innerHTML = `
        <div>
          <div class="ticker-sym">${item.symbol}/${item.currency || "IDR"}</div>
          <div class="ticker-sub">${item.exchange || item.assetClass.toUpperCase()} · ${priceText}${pctText}</div>
        </div>
        <div class="personal-actions">
          <button type="button" class="chip-btn" data-open-wl="${item.lookupKey}">Lihat</button>
          <button type="button" class="chip-btn danger" data-rm-local="${item.lookupKey}">Hapus</button>
        </div>
      `;
      card.querySelector("[data-open-wl]").addEventListener("click", () => {
        openAssetInTerminal(item);
      });
      card.querySelector("[data-rm-local]").addEventListener("click", () => {
        const next = getLocalWatchlist().filter((w) => w.lookupKey !== item.lookupKey);
        saveLocalWatchlist(next);
        showToast(`${item.symbol} dihapus dari watchlist`);
        void loadPersonalTab();
      });
      wlEl.appendChild(card);
    }
    return;
  }

  authNotice.classList.add("hidden");
  renderSkeletonRows(wlEl, 3, false);
  renderSkeletonRows(alEl, 2, false);
  beginLoading();

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
  } finally {
    endLoading();
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
              openAssetInTerminal({
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

function switchTab(tab, options = { preserveSelection: false }) {
  haptic("light");
  state.activeTab = tab;
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
  document.getElementById(`panel-${tab}`).classList.remove("hidden");
  document.querySelectorAll(".nav-btn, .dnav-btn").forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  if (tab === "stocks") {
    if (options.preserveSelection && state.stocksItems.length > 0) {
      return;
    }
    void loadStocksTab(options);
  } else if (tab === "crypto") {
    void loadCryptoTab();
  } else if (tab === "fx") {
    void loadFxTab();
  } else if (tab === "personal") {
    void loadPersonalTab();
  }
}

function setupControls() {
  document.querySelectorAll(".nav-btn, .dnav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Market pulse card shortcuts
  document.getElementById("pulseIdxCard").addEventListener("click", () => {
    state.stockMarket = "idx";
    state.selectedSector = "Semua";
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.market === "idx"));
    void loadStocksTab();
  });
  document.getElementById("pulseUsCard").addEventListener("click", () => {
    state.stockMarket = "us";
    state.selectedSector = "Semua";
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.market === "us"));
    void loadStocksTab();
  });
  document.getElementById("pulseFxCard").addEventListener("click", () => switchTab("fx"));

  // Beginner Glossary Modal
  const guideModal = document.getElementById("guideModal");
  document.getElementById("guideBtn").addEventListener("click", () => {
    haptic("light");
    guideModal.classList.remove("hidden");
  });
  document.getElementById("closeGuideModal").addEventListener("click", () => {
    guideModal.classList.add("hidden");
  });
  guideModal.addEventListener("click", (e) => {
    if (e.target === guideModal) guideModal.classList.add("hidden");
  });

  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      haptic("light");
      state.stockMarket = btn.dataset.market;
      state.selectedSector = "Semua";
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
    if (state.activeTab === "stocks") {
      if (state.selectedAsset.assetClass === "crypto") {
        void loadStocksTab({ preserveSelection: true, force: true });
        void selectAsset(state.selectedAsset);
      } else {
        void loadStocksTab({ preserveSelection: false, force: true });
      }
    } else if (state.activeTab === "crypto") void loadCryptoTab(true);
    else if (state.activeTab === "fx") void loadFxTab(true);
    else void loadPersonalTab();
  });

  document.getElementById("fxConvertBtn").addEventListener("click", () => void runFxConversion());
  document.getElementById("fxFrom").addEventListener("change", () => void runFxConversion());
  document.getElementById("fxTo").addEventListener("change", () => void runFxConversion());
  document.getElementById("fxSwapBtn").addEventListener("click", () => {
    const fromEl = document.getElementById("fxFrom");
    const toEl = document.getElementById("fxTo");
    const tmp = fromEl.value;
    fromEl.value = toEl.value;
    toEl.value = tmp;
    void runFxConversion();
  });
  updateFxSelectorFlags();

  // Watchlist button (Telegram cloud or browser localStorage fallback)
  document.getElementById("btnAddWatchlist").addEventListener("click", async () => {
    haptic("medium");
    if (!initData) {
      const current = getLocalWatchlist();
      const exists = current.some((i) => i.lookupKey === state.selectedAsset.lookupKey);
      if (exists) {
        showToast(`${state.selectedAsset.symbol} sudah ada di watchlist`);
        return;
      }
      current.push({ ...state.selectedAsset });
      saveLocalWatchlist(current);
      showToast(`${state.selectedAsset.symbol} disimpan ke watchlist browser`);
      return;
    }

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
    if (!initData) {
      showToast("Buka lewat @darfinmarketbot di Telegram untuk memasang Price Alert");
      return;
    }
    document.getElementById("alertSymbolInput").value = state.selectedAsset.lookupKey;
    document.getElementById("alertCurrencyLabel").textContent = state.selectedAsset.currency;
    document.getElementById("alertTargetInput").value = "";
    modal.classList.remove("hidden");
  });

  window.addEventListener("resize", () => {
    if (state.chartPoints.length > 0) {
      drawChart(state.chartPoints, state.selectedAsset.currency, -1);
    }
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

function hideSplash() {
  const el = document.getElementById("splashScreen");
  if (!el || el.classList.contains("done")) return;
  el.classList.add("done");
  setTimeout(() => el.remove(), 300);
}

async function bootstrap() {
  const splashGuard = setTimeout(hideSplash, 1400);
  setupChartScrubber();
  setupSearch();
  setupControls();

  // Handle deep-link from Telegram Bot inline buttons: ?asset=BBCA:IDX&type=stock
  const params = new URLSearchParams(window.location.search);
  const deepAsset = params.get("asset");
  const deepType = params.get("type");

  try {
    void loadPulseUsdIdr();
    if (deepAsset) {
      if (deepType === "stock" && !deepAsset.includes(":IDX") && !deepAsset.endsWith(".JK")) {
        state.stockMarket = "us";
        document.getElementById("btnMarketIdx").classList.remove("active");
        document.getElementById("btnMarketUs").classList.add("active");
      }
      await loadStocksTab({ preserveSelection: true });
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
  } finally {
    clearTimeout(splashGuard);
    hideSplash();
  }
}

void bootstrap();
