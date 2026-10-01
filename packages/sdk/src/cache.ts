/**
 * @module cache
 *
 * ## Linkora SDK — In-Memory Cache
 *
 * This module provides a lightweight TTL-based in-memory cache for SDK read
 * results. It is designed to reduce redundant RPC round-trips for data that
 * changes infrequently (e.g. public profiles, pool metadata, governance
 * parameters) while keeping the implementation simple and dependency-free.
 *
 * ### Cache Strategy
 *
 * The cache uses a **TTL (Time-To-Live) eviction** strategy backed by a plain
 * `Map<string, CacheEntry>`. Every entry stores the cached value together with
 * the timestamp at which it was written. On read, the age of the entry is
 * compared against the configured TTL; stale entries are evicted lazily (at
 * read time) and never returned to callers.
 *
 * There is no background sweep loop — eviction is purely demand-driven. This
 * keeps the cache zero-overhead when it is not being used and avoids any timer
 * references that could prevent a Node.js process from exiting cleanly.
 *
 * ### TTL Defaults
 *
 * | Scope                   | Default TTL | Rationale                                        |
 * | ----------------------- | ----------- | ------------------------------------------------ |
 * | General (`SdkCache`)    | 30 s        | Balances freshness vs RPC load for most reads    |
 * | Profile reads           | 60 s        | Profiles change rarely; longer TTL is safe       |
 * | Governance parameters   | 120 s       | On-chain governance is slow-moving               |
 * | Pool metadata           | 30 s        | Pools can receive tips at any time               |
 *
 * Override any TTL by passing `ttlMs` when constructing an `SdkCache` instance.
 *
 * ### Eviction Policy
 *
 * Entries are evicted lazily:
 * - On `get`: if the entry exists but is older than `ttlMs`, it is deleted and
 *   `undefined` is returned (a miss).
 * - On `set`: if the cache has reached `maxSize` entries, the **oldest** entry
 *   (by insertion timestamp) is evicted before the new entry is inserted.
 * - `invalidate(key)` removes a single entry immediately.
 * - `clear()` flushes all entries.
 *
 * ### When NOT to Use the Cache
 *
 * Disable or bypass the cache for any data that must reflect the latest
 * on-chain state:
 *
 * - **Real-time balances** — token or XLM balances change with every tipping
 *   transaction; a cached balance will be wrong the moment a tip lands.
 * - **Live post feeds** — new posts appear continuously; a cached feed will
 *   miss recent content.
 * - **Pending / in-flight transactions** — transaction status (pending →
 *   success / failed) must always be fetched fresh.
 * - **Nonces / sequence numbers** — always fetch the current ledger sequence
 *   number before building a transaction; a cached value will cause a
 *   `tx_bad_seq` error.
 * - **Governance votes** — vote tallies change as participants vote; use a
 *   short TTL or bypass the cache entirely for active proposals.
 *
 * ### Usage
 *
 * ```ts
 * import { SdkCache } from "linkora-sdk";
 *
 * // Default 30-second TTL, max 500 entries:
 * const cache = new SdkCache();
 *
 * // Custom TTL and size:
 * const profileCache = new SdkCache({ ttlMs: 60_000, maxSize: 200 });
 *
 * // Store a value:
 * cache.set("profile:GBFOY...", { username: "alice", bio: "..." });
 *
 * // Retrieve a value (returns undefined on miss or after TTL expiry):
 * const profile = cache.get<Profile>("profile:GBFOY...");
 * if (!profile) {
 *   // Cache miss — fetch from RPC and repopulate:
 *   const fresh = await client.getProfile("GBFOY...");
 *   cache.set("profile:GBFOY...", fresh);
 * }
 *
 * // Invalidate a single entry (e.g. after a profile update):
 * cache.invalidate("profile:GBFOY...");
 *
 * // Flush everything:
 * cache.clear();
 * ```
 */

/** A single cache entry with its value and write timestamp. */
interface CacheEntry<T = unknown> {
  value: T;
  /** Unix timestamp (ms) at which this entry was written. */
  writtenAt: number;
}

/** Options for constructing an {@link SdkCache}. */
export interface SdkCacheOptions {
  /**
   * Time-to-live in milliseconds. Entries older than this are treated as
   * expired and evicted on the next read.
   * @default 30_000
   */
  ttlMs?: number;
  /**
   * Maximum number of entries held at once. When the limit is reached the
   * oldest entry is evicted before the new one is inserted.
   * @default 500
   */
  maxSize?: number;
}

/** Default TTL: 30 seconds. */
export const DEFAULT_CACHE_TTL_MS = 30_000;

/** Default maximum number of entries. */
export const DEFAULT_CACHE_MAX_SIZE = 500;

/**
 * Lightweight TTL in-memory cache used by the Linkora SDK to reduce RPC
 * round-trips for infrequently-changing read results.
 *
 * @example
 * ```ts
 * const cache = new SdkCache({ ttlMs: 60_000 });
 * cache.set("profile:GBFOY...", profile);
 * const hit = cache.get<Profile>("profile:GBFOY...");
 * ```
 */
export class SdkCache {
  private readonly _ttlMs: number;
  private readonly _maxSize: number;
  private readonly _store = new Map<string, CacheEntry>();

  constructor({ ttlMs = DEFAULT_CACHE_TTL_MS, maxSize = DEFAULT_CACHE_MAX_SIZE }: SdkCacheOptions = {}) {
    this._ttlMs = ttlMs;
    this._maxSize = maxSize;
  }

  /**
   * Retrieve a cached value by key.
   *
   * Returns `undefined` if the key does not exist or the entry has expired.
   * Expired entries are evicted lazily at read time.
   */
  get<T>(key: string): T | undefined {
    const entry = this._store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;

    const age = Date.now() - entry.writtenAt;
    if (age > this._ttlMs) {
      this._store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Store a value under the given key.
   *
   * If the cache is at capacity ({@link SdkCacheOptions.maxSize}), the oldest
   * entry is evicted before the new one is inserted.
   */
  set<T>(key: string, value: T): void {
    if (this._store.size >= this._maxSize && !this._store.has(key)) {
      // Evict the oldest entry (Maps iterate in insertion order).
      const oldestKey = this._store.keys().next().value;
      if (oldestKey !== undefined) {
        this._store.delete(oldestKey);
      }
    }
    this._store.set(key, { value, writtenAt: Date.now() });
  }

  /**
   * Remove a single entry from the cache immediately.
   *
   * Call this after a write operation (e.g. profile update) to ensure the
   * next read fetches fresh data from the RPC.
   */
  invalidate(key: string): void {
    this._store.delete(key);
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this._store.clear();
  }

  /** Number of entries currently held (including potentially stale ones). */
  get size(): number {
    return this._store.size;
  }
}
