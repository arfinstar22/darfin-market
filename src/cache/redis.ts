import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { QuotaStore } from "../utils/quota.js";

export interface CachedEntry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

export interface CacheService {
  get<T>(key: string): Promise<{ value: T; isStale: boolean } | null>;
  set<T>(key: string, value: T, ttlSeconds: number, staleTtlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incrementRateLimit(key: string, windowSeconds: number): Promise<number>;
  ping(): Promise<boolean>;
  stats(): { hits: number; misses: number; staleHits: number };
}

export class MemoryCacheService implements CacheService {
  private readonly store = new Map<string, { entry: CachedEntry<unknown>; hardExpiresAt: number }>();
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();
  private hits = 0;
  private misses = 0;
  private staleHits = 0;

  async get<T>(key: string): Promise<{ value: T; isStale: boolean } | null> {
    const item = this.store.get(key);
    const now = Date.now();
    if (!item || item.hardExpiresAt <= now) {
      if (item) this.store.delete(key);
      this.misses += 1;
      return null;
    }
    const isStale = item.entry.expiresAt <= now;
    if (isStale) this.staleHits += 1;
    else this.hits += 1;
    return { value: item.entry.value as T, isStale };
  }

  async set<T>(key: string, value: T, ttlSeconds: number, staleTtlSeconds = ttlSeconds * 6): Promise<void> {
    const now = Date.now();
    this.store.set(key, {
      entry: {
        value,
        storedAt: now,
        expiresAt: now + ttlSeconds * 1000,
      },
      hardExpiresAt: now + Math.max(ttlSeconds, staleTtlSeconds) * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    const existing = this.counters.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  stats() {
    return { hits: this.hits, misses: this.misses, staleHits: this.staleHits };
  }
}

export class RedisCacheService implements CacheService {
  private hits = 0;
  private misses = 0;
  private staleHits = 0;

  constructor(public readonly client: Redis) {}

  async get<T>(key: string): Promise<{ value: T; isStale: boolean } | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) {
        this.misses += 1;
        return null;
      }
      const parsed = JSON.parse(raw) as CachedEntry<T>;
      const isStale = parsed.expiresAt <= Date.now();
      if (isStale) this.staleHits += 1;
      else this.hits += 1;
      return { value: parsed.value, isStale };
    } catch (error) {
      logger.warn({ key, err: error instanceof Error ? error.message : String(error) }, "Redis get failed");
      this.misses += 1;
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    staleTtlSeconds = Math.max(ttlSeconds * 6, 3600),
  ): Promise<void> {
    const now = Date.now();
    const entry: CachedEntry<T> = {
      value,
      storedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };
    const hardTtl = Math.max(ttlSeconds, staleTtlSeconds);
    try {
      await this.client.set(key, JSON.stringify(entry), "EX", hardTtl);
    } catch (error) {
      logger.warn({ key, err: error instanceof Error ? error.message : String(error) }, "Redis set failed");
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.warn({ key, err: error instanceof Error ? error.message : String(error) }, "Redis del failed");
    }
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return count;
  }

  async getCounter(key: string): Promise<number> {
    const raw = await this.client.get(key);
    return raw ? Number(raw) || 0 : 0;
  }

  // QuotaStore compatibility
  async getQuota(key: string): Promise<number> {
    return this.getCounter(key);
  }

  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    try {
      return await this.increment(key, windowSeconds);
    } catch {
      return 1;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === "PONG";
    } catch {
      return false;
    }
  }

  stats() {
    return { hits: this.hits, misses: this.misses, staleHits: this.staleHits };
  }
}

export function createRedisQuotaStore(redis: Redis): QuotaStore {
  return {
    async increment(key: string, ttlSeconds: number): Promise<number> {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, ttlSeconds);
      }
      return count;
    },
    async get(key: string): Promise<number> {
      const raw = await redis.get(key);
      return raw ? Number(raw) || 0 : 0;
    },
  };
}

export function createRedisClient(url: string): Redis {
  const isTls = url.startsWith("rediss://");
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    ...(isTls ? { tls: {} } : {}),
  });

  client.on("error", (err) => {
    logger.error({ err: err.message }, "Redis connection error");
  });

  return client;
}
