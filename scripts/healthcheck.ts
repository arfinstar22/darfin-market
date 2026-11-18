import { createRedisClient } from "../src/cache/redis.js";
import { env } from "../src/config/env.js";
import { checkDbHealth, createDbPool } from "../src/db/client.js";

async function main() {
  const pool = createDbPool();
  const redis = env.REDIS_URL ? createRedisClient(env.REDIS_URL) : null;

  try {
    const dbOk = await checkDbHealth(pool);
    const redisOk = redis
      ? await redis.ping().then((res) => res === "PONG").catch(() => false)
      : true;

    if (!dbOk || !redisOk) {
      console.error(JSON.stringify({ ok: false, dbOk, redisOk }));
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, dbOk, redisOk, redisEnabled: Boolean(redis) }));
  } finally {
    const tasks: Promise<unknown>[] = [pool.end()];
    if (redis) tasks.push(redis.quit());
    await Promise.allSettled(tasks);
  }
}

main().catch(() => {
  process.exit(1);
});
