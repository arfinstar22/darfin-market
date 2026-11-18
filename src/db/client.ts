import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import * as schema from "./schema/index.js";

export type AppDb = NodePgDatabase<typeof schema>;

export function shouldUsePgSsl(connectionString: string): boolean {
  const lower = connectionString.toLowerCase();
  if (lower.includes("sslmode=disable")) return false;
  return (
    lower.includes("sslmode=require") ||
    lower.includes("sslmode=verify") ||
    lower.includes("neon.tech") ||
    lower.includes("supabase.") ||
    lower.includes("render.com")
  );
}

export function createDbPool(connectionString: string = env.DATABASE_URL): Pool {
  const pool = new Pool({
    connectionString,
    ssl: shouldUsePgSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });

  pool.on("error", (err) => {
    logger.error({ err: err.message }, "PostgreSQL pool error");
  });

  return pool;
}

export function createDb(pool: Pool): AppDb {
  return drizzle(pool, { schema });
}

export async function checkDbHealth(pool: Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function runSqlMigrations(pool: Pool): Promise<void> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const sqlPath = path.join(currentDir, "migrations", "0000_initial.sql");
  const sql = await readFile(sqlPath, "utf8");
  await pool.query(sql);
  logger.info("Database SQL migration applied successfully");
}
