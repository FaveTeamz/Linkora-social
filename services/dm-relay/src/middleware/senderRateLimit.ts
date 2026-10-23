/**
 * Per-sender sliding-window rate limiter for the DM relay.
 *
 * Limits message submissions to MAX 60 messages per minute per sender address.
 * Uses the same Redis client as the existing IP-based limiters (rateLimit.ts)
 * when REDIS_URL is configured so the cap applies across all replicas.
 *
 * Acceptance criteria:
 *   - Max 60 messages per minute per sender address
 *   - Uses Redis sliding window (available via ioredis)
 *   - Returns HTTP 429 with Retry-After header when exceeded
 *   - Exports a bypassSender() hook for future verified-user bypass
 */

import { NextFunction, Request, Response } from "express";
import { rateLimitedError } from "@linkora/types/src/errors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default window: 1 minute in milliseconds. */
const WINDOW_MS = 60_000;

/** Max messages a sender may submit in one window. */
export const SENDER_RATE_LIMIT_MAX = parseInt(process.env.SENDER_RATE_LIMIT_MAX || "60", 10);

/** Redis key namespace — same prefix convention as the existing limiters. */
const KEY_PREFIX = "rl:dm-relay:sender:";

// ---------------------------------------------------------------------------
// Store abstraction (mirrors the oracle's RateLimitStore interface)
// ---------------------------------------------------------------------------

interface SenderRateLimitStore {
  /** Record one request and return the count within the current window. */
  addAndCount(senderKey: string, nowMs: number): Promise<number>;
  /** Return the oldest timestamp in the window (for Retry-After). */
  oldestInWindow(senderKey: string, nowMs: number): Promise<number | null>;
  /** Clear all state (tests). */
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory store — per-replica, not shared
// ---------------------------------------------------------------------------

interface MemEntry {
  timestamps: number[];
  expiresAt: number;
}

export class InMemorySenderStore implements SenderRateLimitStore {
  private entries = new Map<string, MemEntry>();

  async addAndCount(senderKey: string, nowMs: number): Promise<number> {
    const cutoff = nowMs - WINDOW_MS;
    let entry = this.entries.get(senderKey);

    if (!entry) {
      entry = { timestamps: [], expiresAt: nowMs + WINDOW_MS * 2 };
    } else {
      this.entries.delete(senderKey); // re-insert for LRU ordering
    }
    this.entries.set(senderKey, entry);

    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    entry.timestamps.push(nowMs);
    entry.expiresAt = nowMs + WINDOW_MS * 2;

    return entry.timestamps.length;
  }

  async oldestInWindow(senderKey: string, nowMs: number): Promise<number | null> {
    const entry = this.entries.get(senderKey);
    if (!entry || entry.timestamps.length === 0) return null;
    const cutoff = nowMs - WINDOW_MS;
    const inWindow = entry.timestamps.filter((t) => t > cutoff);
    return inWindow.length > 0 ? inWindow[0] : null;
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

// ---------------------------------------------------------------------------
// Redis sliding-window store
// ---------------------------------------------------------------------------

// Minimal ioredis surface we need — avoids forcing consumers to install
// @types/ioredis.
interface RedisLike {
  pipeline(): {
    zremrangebyscore(key: string, min: string | number, max: string | number): unknown;
    zadd(key: string, score: number, member: string): unknown;
    zcard(key: string): unknown;
    pexpire(key: string, ms: number): unknown;
    exec(): Promise<Array<[Error | null, unknown]> | null>;
  };
  zrangebyscore(
    key: string,
    min: string | number,
    max: string | number,
    limitKeyword: "LIMIT",
    offset: number,
    count: number
  ): Promise<string[]>;
}

export class RedisSenderStore implements SenderRateLimitStore {
  constructor(private client: RedisLike) {}

  async addAndCount(senderKey: string, nowMs: number): Promise<number> {
    const rKey = KEY_PREFIX + senderKey;
    const cutoff = nowMs - WINDOW_MS;
    const member = `${nowMs}-${Math.random().toString(36).slice(2)}`;

    const pipeline = this.client.pipeline();
    pipeline.zremrangebyscore(rKey, "-inf", cutoff);
    pipeline.zadd(rKey, nowMs, member);
    pipeline.zcard(rKey);
    pipeline.pexpire(rKey, WINDOW_MS * 2);

    const results = await pipeline.exec();
    const zcardResult = results?.[2];
    if (!zcardResult || zcardResult[0]) {
      throw new Error(`Redis pipeline error: ${zcardResult?.[0]}`);
    }
    return zcardResult[1] as number;
  }

  async oldestInWindow(senderKey: string, nowMs: number): Promise<number | null> {
    const rKey = KEY_PREFIX + senderKey;
    const cutoff = nowMs - WINDOW_MS;

    const results = await this.client.zrangebyscore(rKey, cutoff, "+inf", "LIMIT", 0, 1);
    if (!results || results.length === 0) return null;
    return parseInt(results[0].split("-")[0], 10);
  }

  async clear(): Promise<void> {
    // Not used in production — tests only.
  }
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let store: SenderRateLimitStore = new InMemorySenderStore();

/**
 * Upgrade the sender rate-limit store to Redis.
 * Call this after the shared Redis client is available (during server init).
 */
export function setSenderRateLimitStore(redisClient: unknown): void {
  store = new RedisSenderStore(redisClient as RedisLike);
}

/** Replace the store directly (for tests). */
export function _setSenderStore(s: SenderRateLimitStore): void {
  store = s;
}

// ---------------------------------------------------------------------------
// Verified-user bypass registry
// ---------------------------------------------------------------------------

/**
 * Set of sender addresses that are exempt from the per-sender rate limit.
 *
 * Kept as a module-level Set so that a future "verified users" feature can
 * populate it at startup (e.g. by loading from a DB table or env var) without
 * changing the middleware signature.
 */
const bypassSet = new Set<string>();

/**
 * Register a sender address to bypass the per-sender rate limit.
 * This is a placeholder hook for a future "verified users" feature.
 */
export function bypassSender(address: string): void {
  bypassSet.add(address);
}

/**
 * Remove a sender bypass (e.g. when a user is de-verified).
 */
export function removeSenderBypass(address: string): void {
  bypassSet.delete(address);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that enforces a per-sender sliding-window rate limit on
 * POST /messages.
 *
 * The sender address is read from `req.stellarAddress`, which is set by the
 * `messageAuthMiddleware` that runs before this middleware in the route chain.
 * If the address is absent (should never happen in normal flow) the request is
 * passed through so as not to block unauthenticated requests from reaching the
 * existing 401 handler.
 */
export function senderRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const sender = (req as Request & { stellarAddress?: string }).stellarAddress;

  if (!sender) {
    // No authenticated sender — let downstream auth return 401.
    next();
    return;
  }

  // Verified users are exempt.
  if (bypassSet.has(sender)) {
    next();
    return;
  }

  const nowMs = Date.now();

  store
    .addAndCount(sender, nowMs)
    .then(async (count) => {
      if (count <= SENDER_RATE_LIMIT_MAX) {
        next();
        return;
      }

      // Compute Retry-After
      const oldest = await store.oldestInWindow(sender, nowMs);
      const retryAfterMs = oldest !== null ? Math.max(0, WINDOW_MS - (nowMs - oldest)) : WINDOW_MS;
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      const err = rateLimitedError(`Max ${SENDER_RATE_LIMIT_MAX} messages per minute per sender`);

      res
        .status(err.statusCode)
        .set("Retry-After", String(retryAfterSeconds))
        .json(err.toJSON((req as Request & { requestId?: string }).requestId));
    })
    .catch(next);
}
