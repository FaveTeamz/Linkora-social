/**
 * Small process-local cache for web app data that can be safely re-fetched.
 * Entries expire after their TTL and reads refresh their LRU position.
 */
export class MemoryCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly maxEntries = 500,
    private readonly defaultTtlMs = 60_000
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive integer");
    }
    if (!Number.isFinite(defaultTtlMs) || defaultTtlMs <= 0) {
      throw new RangeError("defaultTtlMs must be a positive finite number");
    }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    // Map insertion order tracks least-to-most recently used entries.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError("ttlMs must be a positive finite number");
    }

    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    this.removeExpiredEntries();
    while (this.entries.size > this.maxEntries) {
      const leastRecentlyUsed = this.entries.keys().next().value as string | undefined;
      if (leastRecentlyUsed === undefined) break;
      this.entries.delete(leastRecentlyUsed);
    }
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
  }

  private removeExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
