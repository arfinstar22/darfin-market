import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { AppServices } from "../bot/context.js";
import { env, getEffectiveWebAppPort } from "../config/env.js";
import type { UserRow } from "../db/schema/index.js";
import { parseChartRange } from "../services/chart.service.js";
import type { MarketTicker } from "../types/market.js";
import { AppError, ValidationError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { verifyTelegramInitData } from "./telegram-auth.js";

const MAX_BODY_BYTES = 16_384;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const addWatchlistBodySchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  mode: z.enum(["auto", "crypto", "stock"]).optional().default("auto"),
});

const createAlertBodySchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  condition: z.enum(["above", "below"]),
  targetPrice: z.union([z.string(), z.number()]).transform((v) => String(v)),
  quoteCurrency: z.string().trim().min(3).max(5).optional(),
});

const patchAlertBodySchema = z.object({
  action: z.enum(["pause", "resume"]),
});

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new ValidationError("Payload terlalu besar.");
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("Format JSON tidak valid.");
  }
}

async function resolveAuthenticatedUser(
  req: IncomingMessage,
  services: AppServices,
  botToken: string,
): Promise<UserRow | null> {
  const initData = req.headers["x-telegram-init-data"];
  if (typeof initData !== "string" || initData.trim().length === 0) {
    return null;
  }

  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified) {
    return null;
  }

  return services.userRepo.upsertTelegramUser({
    telegramUserId: verified.telegramUserId,
    username: verified.username,
    firstName: verified.firstName,
    language: verified.languageCode,
  });
}

export interface WebAppServerOptions {
  services: AppServices;
  botToken?: string;
  host?: string;
  port?: number;
  publicDir?: string;
}

export function createWebAppServer(options: WebAppServerOptions): Server {
  const { services } = options;
  const botToken = options.botToken ?? env.TELEGRAM_BOT_TOKEN;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = options.publicDir ?? path.join(currentDir, "public");

  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const pathname = parsedUrl.pathname;

      // Static frontend files
      if (method === "GET" && (pathname === "/" || pathname === "/index.html" || pathname === "/styles.css" || pathname === "/app.js")) {
        const fileName = pathname === "/" ? "index.html" : pathname.slice(1);
        const filePath = path.join(publicDir, fileName);
        const content = await readFile(filePath);
        const ext = path.extname(fileName);
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
          "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        });
        res.end(content);
        return;
      }

      // Ultra-lightweight health/keepalive ping for Render.com healthCheckPath & 10-min cron jobs
      if ((method === "GET" || method === "HEAD") && pathname === "/healthz") {
        if (method === "HEAD") {
          res.writeHead(200, { "Cache-Control": "no-store" });
          res.end();
          return;
        }
        sendJson(res, 200, {
          ok: true,
          service: "darfin-market",
          uptimeSeconds: Math.floor(process.uptime()),
          ts: new Date().toISOString(),
        });
        return;
      }

      // Public Health & Status
      if (method === "GET" && pathname === "/api/health") {
        const status = await services.healthService.getSystemStatus();
        sendJson(res, 200, { ok: true, status });
        return;
      }

      // Market Overview
      if (method === "GET" && pathname === "/api/overview") {
        const overview = await services.marketService.getMarketOverview();
        sendJson(res, 200, {
          ok: true,
          overview,
          popularIdx: services.stockService.getPopularIdxStocks(),
          popularUs: services.stockService.getPopularUsStocks(),
          stockProvidersConfigured: services.stockService.hasAnyConfiguredProvider(),
        });
        return;
      }

      // Stocks list (popular IDX or US with live quotes when configured)
      if (method === "GET" && pathname === "/api/stocks") {
        const market = parsedUrl.searchParams.get("market")?.toLowerCase() === "us" ? "us" : "idx";
        const curated =
          market === "idx"
            ? services.stockService.getPopularIdxStocks()
            : services.stockService.getPopularUsStocks();

        let quotes;
        if (market === "idx") {
          const batchMap = await services.stockService.lookupIdxBatch(curated.map((c) => c.symbol));
          quotes = curated.map((item) => {
            const lookupKey = `${item.symbol}:IDX`;
            const resQuote = batchMap.get(item.symbol);
            return {
              ...item,
              lookupKey,
              ticker: resQuote?.ticker ?? null,
              error: resQuote?.error,
              unconfiguredHint: resQuote?.unconfiguredHint,
            };
          });
        } else {
          quotes = await Promise.all(
            curated.map(async (item) => {
              const lookupKey = item.symbol;
              const resQuote = await services.stockService.lookupStock(lookupKey);
              return {
                ...item,
                lookupKey,
                ticker: resQuote.ticker,
                error: resQuote.error,
                unconfiguredHint: resQuote.unconfiguredHint,
              };
            }),
          );
        }

        const hint = quotes.find((q) => q.unconfiguredHint)?.unconfiguredHint;
        sendJson(res, 200, {
          ok: true,
          market: market.toUpperCase(),
          configured: !hint,
          unconfiguredHint: hint ?? null,
          items: quotes,
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      // Single stock detail
      if (method === "GET" && pathname.startsWith("/api/stock/")) {
        const symbol = decodeURIComponent(pathname.slice("/api/stock/".length));
        const result = await services.stockService.lookupStock(symbol);
        sendJson(res, 200, { ok: true, result });
        return;
      }

      // Crypto list (INDODAX IDR + CoinPaprika movers)
      if (method === "GET" && pathname === "/api/crypto") {
        const [indodaxRes, gainersRes, losersRes, globalRes] = await Promise.allSettled([
          services.marketService.getPopularIndodaxTickers(),
          services.marketService.getTopMovers("gainers", 8),
          services.marketService.getTopMovers("losers", 8),
          services.marketService.getMarketOverview().then((o) => o.globalStats),
        ]);

        sendJson(res, 200, {
          ok: true,
          indodax: indodaxRes.status === "fulfilled" ? indodaxRes.value : [],
          gainers: gainersRes.status === "fulfilled" ? gainersRes.value : [],
          losers: losersRes.status === "fulfilled" ? losersRes.value : [],
          global: globalRes.status === "fulfilled" ? globalRes.value : null,
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      // Single crypto detail
      if (method === "GET" && pathname.startsWith("/api/crypto/")) {
        const symbol = decodeURIComponent(pathname.slice("/api/crypto/".length));
        const result = await services.marketService.lookupCrypto(symbol);
        sendJson(res, 200, { ok: true, result });
        return;
      }

      // Chart series JSON
      if (method === "GET" && pathname === "/api/chart") {
        const symbol = parsedUrl.searchParams.get("symbol") ?? "";
        const range = parseChartRange(parsedUrl.searchParams.get("range") ?? "7d");
        const series = await services.chartService.getChartSeries(symbol, range);
        sendJson(res, 200, { ok: true, series });
        return;
      }

      // FX rates
      if (method === "GET" && pathname === "/api/fx") {
        const base = parsedUrl.searchParams.get("base") ?? "USD";
        const summary = await services.fxService.getRatesSummary(base);
        sendJson(res, 200, { ok: true, ...summary });
        return;
      }

      // FX convert
      if (method === "GET" && pathname === "/api/convert") {
        const amount = parsedUrl.searchParams.get("amount") ?? "";
        const from = parsedUrl.searchParams.get("from") ?? "USD";
        const to = parsedUrl.searchParams.get("to") ?? "IDR";
        const conversion = await services.fxService.convert(amount, from, to);
        sendJson(res, 200, { ok: true, conversion });
        return;
      }

      // Unified search
      if (method === "GET" && pathname === "/api/search") {
        const q = parsedUrl.searchParams.get("q") ?? "";
        const [stocksRes, cryptoRes] = await Promise.allSettled([
          services.searchService.searchStocks(q, 6),
          services.searchService.searchCrypto(q, 6),
        ]);
        sendJson(res, 200, {
          ok: true,
          results: [
            ...(stocksRes.status === "fulfilled" ? stocksRes.value : []),
            ...(cryptoRes.status === "fulfilled" ? cryptoRes.value : []),
          ],
        });
        return;
      }

      // Real-time Server-Sent Events stream (respects provider cache TTLs)
      if (method === "GET" && pathname === "/api/stream") {
        const rawSymbols = (parsedUrl.searchParams.get("symbols") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 12);
        const type = parsedUrl.searchParams.get("type") === "crypto" ? "crypto" : "stock";

        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        let closed = false;

        const pushSnapshot = async () => {
          if (closed) return;
          try {
            const ticks: MarketTicker[] = [];
            if (type === "crypto") {
              const allIndodax = await services.marketService.getPopularIndodaxTickers();
              ticks.push(...allIndodax);
            } else if (rawSymbols.length > 0 && services.stockService.hasAnyConfiguredProvider()) {
              const idxSymbols = rawSymbols.filter(
                (s) => s.toUpperCase().endsWith(":IDX") || s.toUpperCase().endsWith(".JK"),
              );
              const otherSymbols = rawSymbols.filter((s) => !idxSymbols.includes(s));

              if (idxSymbols.length > 0) {
                const idxBatch = await services.stockService.lookupIdxBatch(idxSymbols);
                for (const item of idxBatch.values()) {
                  if (item.ticker) ticks.push(item.ticker);
                }
              }
              if (otherSymbols.length > 0) {
                const settled = await Promise.allSettled(
                  otherSymbols.map((sym) => services.stockService.lookupStock(sym)),
                );
                for (const item of settled) {
                  if (item.status === "fulfilled" && item.value.ticker) {
                    ticks.push(item.value.ticker);
                  }
                }
              }
            }

            if (!closed) {
              res.write(
                `event: tick\ndata: ${JSON.stringify({ ticks, ts: new Date().toISOString() })}\n\n`,
              );
            }
          } catch (err) {
            logger.warn({ err: String(err) }, "SSE tick push failed");
          }
        };

        void pushSnapshot();
        const intervalMs = type === "crypto" ? 20_000 : 15_000;
        const tickTimer = setInterval(() => void pushSnapshot(), intervalMs);
        const heartbeatTimer = setInterval(() => {
          if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`);
        }, 25_000);

        req.on("close", () => {
          closed = true;
          clearInterval(tickTimer);
          clearInterval(heartbeatTimer);
        });
        return;
      }

      // Authenticated Personal Watchlist & Alerts
      if (pathname.startsWith("/api/watchlist") || pathname.startsWith("/api/alerts")) {
        const user = await resolveAuthenticatedUser(req, services, botToken);
        if (!user) {
          sendJson(res, 401, {
            ok: false,
            error: "Buka Mini App melalui bot Telegram DARFIN MARKET untuk mengakses Watchlist & Alerts personal.",
          });
          return;
        }

        if (pathname === "/api/watchlist" && method === "GET") {
          const items = await services.watchlistService.getWatchlistWithPrices(user.id);
          sendJson(res, 200, { ok: true, items });
          return;
        }

        if (pathname === "/api/watchlist" && method === "POST") {
          const body = addWatchlistBodySchema.parse(await readJsonBody(req));
          const result = await services.watchlistService.addByInput(user.id, body.symbol, body.mode);
          sendJson(res, 201, { ok: true, ...result });
          return;
        }

        if (pathname.startsWith("/api/watchlist/") && method === "DELETE") {
          const id = decodeURIComponent(pathname.slice("/api/watchlist/".length));
          const removed = await services.watchlistService.removeById(user.id, id);
          sendJson(res, 200, { ok: true, removed });
          return;
        }

        if (pathname === "/api/alerts" && method === "GET") {
          const alerts = await services.alertService.listUserAlerts(user.id);
          sendJson(res, 200, { ok: true, alerts });
          return;
        }

        if (pathname === "/api/alerts" && method === "POST") {
          const body = createAlertBodySchema.parse(await readJsonBody(req));
          const created = await services.alertService.createAlert({
            userId: user.id,
            symbolInput: body.symbol,
            conditionRaw: body.condition,
            targetPriceRaw: body.targetPrice,
            quoteCurrencyRaw: body.quoteCurrency,
          });
          sendJson(res, 201, { ok: true, ...created });
          return;
        }

        if (pathname.startsWith("/api/alerts/") && method === "PATCH") {
          const id = decodeURIComponent(pathname.slice("/api/alerts/".length));
          const body = patchAlertBodySchema.parse(await readJsonBody(req));
          const updated =
            body.action === "pause"
              ? await services.alertService.pauseAlert(user.id, id)
              : await services.alertService.resumeAlert(user.id, id);
          sendJson(res, 200, { ok: true, alert: updated });
          return;
        }

        if (pathname.startsWith("/api/alerts/") && method === "DELETE") {
          const id = decodeURIComponent(pathname.slice("/api/alerts/".length));
          const deleted = await services.alertService.deleteAlert(user.id, id);
          sendJson(res, 200, { ok: true, alert: deleted });
          return;
        }
      }

      sendJson(res, 404, { ok: false, error: "Endpoint tidak ditemukan." });
    } catch (error) {
      if (error instanceof AppError) {
        sendJson(res, 400, { ok: false, code: error.code, error: error.userMessage });
        return;
      }
      if (error instanceof z.ZodError) {
        sendJson(res, 400, { ok: false, error: "Parameter input tidak valid." });
        return;
      }
      logger.error(
        { err: error instanceof Error ? error.message : String(error), url: req.url },
        "WebApp server request error",
      );
      sendJson(res, 500, { ok: false, error: "Terjadi kendala internal server." });
    }
  });

  return server;
}

export async function startWebAppServer(options: WebAppServerOptions): Promise<Server> {
  const host = options.host ?? env.WEBAPP_HOST;
  const port = options.port ?? getEffectiveWebAppPort();
  const server = createWebAppServer(options);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  logger.info({ host, port }, "DARFIN MARKET Telegram Mini App server listening");
  return server;
}
