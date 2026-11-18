import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../../src/bot/context.js";
import { MemoryCacheService } from "../../src/cache/redis.js";
import { POPULAR_IDX_STOCKS, POPULAR_US_STOCKS } from "../../src/config/constants.js";
import {
  getEffectiveWebAppPort,
  getEffectiveWebAppUrl,
  parseEnv,
} from "../../src/config/env.js";
import { shouldUsePgSsl } from "../../src/db/client.js";
import { startWebAppServer } from "../../src/webapp/server.js";
import { verifyTelegramInitData } from "../../src/webapp/telegram-auth.js";
import { getBullConnectionOptions } from "../../src/workers/queues.js";

function buildSignedInitData(
  botToken: string,
  userObj: { id: number; username?: string; first_name?: string },
  authDate: number,
): string {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify(userObj),
  });
  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(pairs.join("\n")).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("Telegram Mini App HMAC auth and HTTP API", () => {
  const testToken = "123456789:TEST_BOT_TOKEN_FOR_HMAC_VALIDATION";

  it("verifies valid Telegram initData and rejects tampered or expired payloads", () => {
    const now = Math.floor(Date.now() / 1000);
    const valid = buildSignedInitData(testToken, { id: 998877, username: "darfin" }, now);

    const parsed = verifyTelegramInitData(valid, testToken, 86_400, now + 10);
    expect(parsed).not.toBeNull();
    expect(parsed?.telegramUserId).toBe(998877n);
    expect(parsed?.username).toBe("darfin");

    // Wrong token
    expect(verifyTelegramInitData(valid, "999:WRONG_TOKEN", 86_400, now + 10)).toBeNull();

    // Tampered payload
    const tampered = valid.replace("darfin", "attacker");
    expect(verifyTelegramInitData(tampered, testToken, 86_400, now + 10)).toBeNull();

    // Expired auth_date
    const expired = buildSignedInitData(testToken, { id: 998877 }, now - 100_000);
    expect(verifyTelegramInitData(expired, testToken, 86_400, now)).toBeNull();
  });

  describe("WebApp HTTP server routes", () => {
    let baseUrl = "";
    let closeServer: () => Promise<void>;

    beforeAll(async () => {
      const mockServices = {
        cache: new MemoryCacheService(),
        userRepo: {
          upsertTelegramUser: vi.fn().mockResolvedValue({
            id: "user-uuid-1",
            telegramUserId: 998877n,
            username: "darfin",
            firstName: "Darfin",
            timezone: "Asia/Makassar",
            language: "id",
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
        stockService: {
          getPopularIdxStocks: () => POPULAR_IDX_STOCKS,
          getPopularUsStocks: () => POPULAR_US_STOCKS,
          hasAnyConfiguredProvider: () => true,
          lookupIdxBatch: vi.fn().mockResolvedValue(
            new Map([
              [
                "BBCA",
                {
                  query: "BBCA",
                  market: "IDX",
                  ticker: {
                    provider: "goapi",
                    assetClass: "stock",
                    assetId: "BBCA:IDX",
                    symbol: "BBCA",
                    name: "Bank Central Asia Tbk",
                    exchange: "IDX",
                    quoteCurrency: "IDR",
                    price: "10150",
                    change24hPercent: "1.25",
                    dataFeedType: "delayed_or_eod",
                    sourceLabel: "Sumber: GoAPI.io (IDX) — delay 3-10 menit",
                    fetchedAt: new Date().toISOString(),
                    isStale: false,
                  },
                },
              ],
            ]),
          ),
          lookupStock: vi.fn().mockResolvedValue({
            query: "BBCA",
            market: "IDX",
            ticker: {
              provider: "twelvedata",
              assetClass: "stock",
              assetId: "BBCA:IDX",
              symbol: "BBCA",
              name: "Bank Central Asia Tbk",
              exchange: "IDX",
              quoteCurrency: "IDR",
              price: "10100",
              change24hPercent: "1.25",
              dataFeedType: "delayed_or_eod",
              sourceLabel: "Sumber: Twelve Data (IDX) — delayed/EOD sesuai plan",
              fetchedAt: new Date().toISOString(),
              isStale: false,
            },
          }),
        },
        watchlistService: {
          getWatchlistWithPrices: vi.fn().mockResolvedValue([]),
        },
        alertService: {
          listUserAlerts: vi.fn().mockResolvedValue([]),
        },
        healthService: {
          getSystemStatus: vi.fn().mockResolvedValue({
            botOk: true,
            dbOk: true,
            redisOk: true,
            cacheStats: { hits: 1, misses: 0, staleHits: 0 },
            providers: [],
            quotas: [],
          }),
        },
      } as unknown as AppServices;

      const server = await startWebAppServer({
        services: mockServices,
        botToken: testToken,
        host: "127.0.0.1",
        port: 0,
      });
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      closeServer = () => new Promise((resolve) => server.close(() => resolve()));
    });

    afterAll(async () => {
      await closeServer();
    });

    it("serves Mini App HTML and static assets", async () => {
      const htmlRes = await fetch(`${baseUrl}/`);
      expect(htmlRes.status).toBe(200);
      const html = await htmlRes.text();
      expect(html).toContain("DARFIN MARKET");
      expect(html).toContain("telegram-web-app.js");

      const cssRes = await fetch(`${baseUrl}/styles.css`);
      expect(cssRes.status).toBe(200);
      const jsRes = await fetch(`${baseUrl}/app.js`);
      expect(jsRes.status).toBe(200);
    });

    it("returns IDX stock quotes on /api/stocks?market=idx", async () => {
      const res = await fetch(`${baseUrl}/api/stocks?market=idx`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; market: string; items: Array<{ symbol: string }> };
      expect(json.ok).toBe(true);
      expect(json.market).toBe("IDX");
      expect(json.items.some((i) => i.symbol === "BBCA")).toBe(true);
    });

    it("responds 200 OK on lightweight /healthz (GET & HEAD) for Render cron pings", async () => {
      const getRes = await fetch(`${baseUrl}/healthz`);
      expect(getRes.status).toBe(200);
      const body = (await getRes.json()) as { ok: boolean; service: string };
      expect(body.ok).toBe(true);
      expect(body.service).toBe("darfin-market");

      const headRes = await fetch(`${baseUrl}/healthz`, { method: "HEAD" });
      expect(headRes.status).toBe(200);
    });

    it("auto-detects Render PORT, RENDER_EXTERNAL_URL, cloud PG SSL, and Upstash rediss:// TLS", () => {
      const renderEnv = parseEnv({
        PORT: "10000",
        RENDER_EXTERNAL_URL: "https://darfin-market.onrender.com",
        RUN_EMBEDDED_WORKER: "true",
      });
      expect(getEffectiveWebAppPort(renderEnv)).toBe(10000);
      expect(getEffectiveWebAppUrl(renderEnv)).toBe("https://darfin-market.onrender.com");
      expect(renderEnv.RUN_EMBEDDED_WORKER).toBe(true);

      expect(shouldUsePgSsl("postgresql://u:p@ep-cool.neon.tech/db?sslmode=require")).toBe(true);
      expect(shouldUsePgSsl("postgresql://darfin:pw@postgres:5432/darfin_market")).toBe(false);

      const bullTls = getBullConnectionOptions("rediss://default:secret@us1-example.upstash.io:6379");
      expect((bullTls as { tls?: unknown }).tls).toBeDefined();
    });

    it("guards /api/watchlist with Telegram HMAC initData auth", async () => {
      const unauth = await fetch(`${baseUrl}/api/watchlist`);
      expect(unauth.status).toBe(401);

      const now = Math.floor(Date.now() / 1000);
      const initData = buildSignedInitData(testToken, { id: 998877, username: "darfin" }, now);
      const authed = await fetch(`${baseUrl}/api/watchlist`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      expect(authed.status).toBe(200);
      const json = (await authed.json()) as { ok: boolean; items: unknown[] };
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.items)).toBe(true);
    });
  });
});
