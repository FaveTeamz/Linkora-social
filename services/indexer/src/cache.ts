import Redis from "ioredis";
import { logger } from "./logger";
import { cacheHitRate, cacheHitsTotal, cacheMissesTotal } from "./metrics";

interface CacheRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiry: "EX", ttlSeconds: number): Promise<unknown>;
  scan(
    cursor: string,
    match: "MATCH",
    pattern: string,
    count: "COUNT",
    countValue: number
  ): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
  quit(): Promise<unknown>;
}

export interface QueryCache {
  getOrLoad<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T>;
  invalidateFeed(): Promise<void>;
  invalidateProfiles(): Promise<void>;
  close(): Promise<void>;
}

export function feedCacheKey(filter: string, cursor: string | number): string {
  return `linkora:feed:${filter}:${cursor}`;
}

export function profileCacheKey(address: string): string {
  return `linkora:profile:${address}`;
}

export class RedisQueryCache implements QueryCache {
  private readonly client: CacheRedisClient | null;

  constructor(redisUrl?: string) {
    this.client = redisUrl
      ? (new Redis(redisUrl, {
          enableOfflineQueue: false,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
        }) as unknown as CacheRedisClient)
      : null;
  }

  async getOrLoad<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    if (this.client) {
      try {
        const cached = await this.client.get(key);
        if (cached !== null) {
          cacheHitsTotal.inc();
          cacheHitRate.set(
            cacheHitsTotal.getValue() / (cacheHitsTotal.getValue() + cacheMissesTotal.getValue())
          );
          return JSON.parse(cached) as T;
        }
      } catch (err) {
        logger.warn({ err, key }, "Redis cache read failed; falling back to database");
      }
    }

    cacheMissesTotal.inc();
    cacheHitRate.set(
      cacheHitsTotal.getValue() / (cacheHitsTotal.getValue() + cacheMissesTotal.getValue())
    );
    const value = await load();
    if (this.client) {
      try {
        await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
      } catch (err) {
        logger.warn({ err, key }, "Redis cache write failed");
      }
    }
    return value;
  }

  invalidateFeed(): Promise<void> {
    return this.invalidatePattern("linkora:feed:*");
  }

  invalidateProfiles(): Promise<void> {
    return this.invalidatePattern("linkora:profile:*");
  }

  async close(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch (err) {
      logger.warn({ err }, "Failed to close Redis query cache connection");
    }
  }

  private async invalidatePattern(pattern: string): Promise<void> {
    if (!this.client) return;
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        if (keys.length > 0) await this.client.del(...keys);
      } while (cursor !== "0");
    } catch (err) {
      logger.warn({ err, pattern }, "Redis cache invalidation failed");
    }
  }
}
