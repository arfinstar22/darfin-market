import { createDbPool, runSqlMigrations } from "../src/db/client.js";
import { logger } from "../src/utils/logger.js";

async function main() {
  const pool = createDbPool();
  try {
    await runSqlMigrations(pool);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "Migration failed");
  process.exit(1);
});
