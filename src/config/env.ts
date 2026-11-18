import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().min(1).default("DARFIN MARKET"),
  APP_TIMEZONE: z.string().min(1).default("Asia/Makassar"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  TELEGRAM_BOT_TOKEN: z.string().min(10).default("0000000000:TEST_TOKEN_PLACEHOLDER"),
  TELEGRAM_ADMIN_IDS: z
    .string()
    .default("")
    .transform((raw) =>
      raw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^\d+$/.test(id))
        .map((id) => BigInt(id)),
    ),

  WEBAPP_HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).optional()),
  WEBAPP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).optional()),
  WEBAPP_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  RENDER_EXTERNAL_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  RUN_EMBEDDED_WORKER: z
    .preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.union([z.boolean(), z.enum(["true", "false", "1", "0"])]))
    .default(false)
    .transform((v) => v === true || v === "true" || v === "1"),

  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://darfin:change_me@localhost:5432/darfin_market"),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  INDODAX_BASE_URL: z.string().url().default("https://indodax.com"),
  COINPAPRIKA_BASE_URL: z.string().url().default("https://api.coinpaprika.com/v1"),
  FRANKFURTER_BASE_URL: z.string().url().default("https://api.frankfurter.dev/v2"),

  FINNHUB_BASE_URL: z.string().url().default("https://finnhub.io/api/v1"),
  FINNHUB_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  TWELVE_DATA_BASE_URL: z.string().url().default("https://api.twelvedata.com"),
  TWELVE_DATA_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  ALPHA_VANTAGE_BASE_URL: z.string().url().default("https://www.alphavantage.co"),
  ALPHA_VANTAGE_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  GOAPI_BASE_URL: z.string().url().default("https://api.goapi.io"),
  GOAPI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  INDODAX_TICKER_TTL: z.coerce.number().int().min(5).max(3600).default(20),
  INDODAX_PAIRS_TTL: z.coerce.number().int().min(60).max(86400).default(21600),
  COINPAPRIKA_TICKER_TTL: z.coerce.number().int().min(60).max(7200).default(600),
  FRANKFURTER_RATE_TTL: z.coerce.number().int().min(3600).max(86400).default(21600),
  STOCK_US_QUOTE_TTL: z.coerce.number().int().min(5).max(3600).default(15),
  STOCK_GLOBAL_QUOTE_TTL: z.coerce.number().int().min(15).max(3600).default(60),

  INDODAX_ALERT_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(60),
  COINPAPRIKA_ALERT_INTERVAL_SECONDS: z.coerce.number().int().min(300).max(7200).default(600),
  STOCK_ALERT_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  SNAPSHOT_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  SNAPSHOT_RETENTION_DAYS: z.coerce.number().int().min(7).max(365).default(60),

  COINPAPRIKA_MONTHLY_QUOTA: z.coerce.number().int().min(100).default(20000),
  TWELVE_DATA_DAILY_QUOTA: z.coerce.number().int().min(10).default(800),
  ALPHA_VANTAGE_DAILY_QUOTA: z.coerce.number().int().min(5).default(25),
  GOAPI_DAILY_QUOTA: z.coerce.number().int().min(10).default(500),

  MAX_WATCHLIST_ITEMS: z.coerce.number().int().min(1).max(100).default(20),
  MAX_ACTIVE_ALERTS_PER_USER: z.coerce.number().int().min(1).max(100).default(20),
  USER_COMMANDS_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(20),
  PROVIDER_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

export function getEffectiveWebAppPort(config: AppEnv = env): number {
  return config.PORT ?? config.WEBAPP_PORT ?? 3000;
}

export function getEffectiveWebAppUrl(config: AppEnv = env): string | undefined {
  return config.WEBAPP_URL ?? config.RENDER_EXTERNAL_URL;
}

export const env = parseEnv();
