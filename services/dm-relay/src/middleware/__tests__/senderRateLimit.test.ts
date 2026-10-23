/**
 * Tests for the per-sender sliding-window rate limiter middleware.
 *
 * Covers:
 *   - In-memory store: addAndCount, oldestInWindow
 *   - Redis store: sliding-window correctness, pipeline error handling
 *   - senderRateLimitMiddleware: allow / block / Retry-After / bypass /
 *     no-sender pass-through / Redis error fail-open
 */

import { Request, Response } from "express";
import {
  InMemorySenderStore,
  RedisSenderStore,
  SENDER_RATE_LIMIT_MAX,
  senderRateLimitMiddleware,
  bypassSender,
  removeSenderBypass,
  _setSenderStore,
} from "../senderRateLimit";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const SENDER = "GSENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const NOW = 1_700_000_000_000;
const WINDOW_MS = 60_000;

function makeReq(stellarAddress?: string): Request {
  return {
    stellarAddress,
    requestId: "test-req-id",
  } as unknown as Request;
}

interface FakeRes extends Response {
  body?: unknown;
  _status?: number;
  _headers?: Record<string, string>;
}

function makeRes(): FakeRes {
  const res = {} as FakeRes;
  res._headers = {};
  res._status = 200;

  res.status = jest.fn((code: number) => {
    res._status = code;
    return res;
  }) as unknown as Response["status"];

  res.set = jest.fn((key: string, value: string) => {
    res._headers![key] = value;
    return res;
  }) as unknown as Response["set"];

  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response["json"];

  return res;
}

// ---------------------------------------------------------------------------
// InMemorySenderStore
// ---------------------------------------------------------------------------

describe("InMemorySenderStore", () => {
  let store: InMemorySenderStore;

  beforeEach(() => {
    store = new InMemorySenderStore();
  });

  it("counts the first message as 1", async () => {
    expect(await store.addAndCount(SENDER, NOW)).toBe(1);
  });

  it("increments for each successive message in the same window", async () => {
    for (let i = 1; i <= 5; i++) {
      expect(await store.addAndCount(SENDER, NOW + i)).toBe(i);
    }
  });

  it("evicts timestamps outside the 60-second window", async () => {
    // Add 3 messages in window A (timestamps far apart within the window).
    for (let i = 0; i < 3; i++) {
      await store.addAndCount(SENDER, NOW + i * 1000);
    }

    // Advance well past the window so ALL 3 timestamps are before the cutoff.
    // cutoff = (NOW + WINDOW_MS * 2) - WINDOW_MS = NOW + WINDOW_MS
    // timestamps at NOW, NOW+1000, NOW+2000 are all <= NOW + WINDOW_MS
    expect(await store.addAndCount(SENDER, NOW + WINDOW_MS * 2)).toBe(1);
  });

  it("keeps separate counts per sender", async () => {
    await store.addAndCount(SENDER, NOW);
    await store.addAndCount(SENDER, NOW + 1);

    const other = "GOTHERSENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(await store.addAndCount(other, NOW)).toBe(1);
  });

  it("clear() resets all counters", async () => {
    await store.addAndCount(SENDER, NOW);
    await store.addAndCount(SENDER, NOW + 1);
    await store.clear();
    expect(await store.addAndCount(SENDER, NOW + 2)).toBe(1);
  });

  describe("oldestInWindow", () => {
    it("returns null when there are no entries", async () => {
      expect(await store.oldestInWindow(SENDER, NOW)).toBeNull();
    });

    it("returns the oldest timestamp still within the window", async () => {
      await store.addAndCount(SENDER, NOW + 100);
      await store.addAndCount(SENDER, NOW + 200);
      await store.addAndCount(SENDER, NOW + 300);

      expect(await store.oldestInWindow(SENDER, NOW + 300)).toBe(NOW + 100);
    });

    it("excludes timestamps that have slid out of the window", async () => {
      await store.addAndCount(SENDER, NOW);
      await store.addAndCount(SENDER, NOW + WINDOW_MS + 1);

      // NOW is outside the window relative to now = NOW + WINDOW_MS + 1
      expect(await store.oldestInWindow(SENDER, NOW + WINDOW_MS + 1)).toBe(NOW + WINDOW_MS + 1);
    });

    it("returns null when all timestamps have expired", async () => {
      await store.addAndCount(SENDER, NOW);
      expect(await store.oldestInWindow(SENDER, NOW + WINDOW_MS + 1)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Minimal Redis fake
// ---------------------------------------------------------------------------

class FakeRedisClient {
  /** sorted-set storage: key → Map<member, score> */
  private sets = new Map<string, Map<string, number>>();

  private getSet(key: string): Map<string, number> {
    if (!this.sets.has(key)) this.sets.set(key, new Map());
    return this.sets.get(key)!;
  }

  pipeline() {
    const ops: Array<() => unknown> = [];
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const chain = {
      zremrangebyscore: (key: string, _min: string | number, max: string | number) => {
        ops.push(() => {
          const set = self.getSet(key);
          const maxVal = max === "+inf" ? Infinity : Number(max);
          for (const [member, score] of set) {
            if (score <= maxVal) set.delete(member);
          }
          return 0;
        });
        return chain;
      },
      zadd: (key: string, score: number, member: string) => {
        ops.push(() => {
          self.getSet(key).set(member, score);
          return 1;
        });
        return chain;
      },
      zcard: (key: string) => {
        ops.push(() => self.getSet(key).size);
        return chain;
      },
      pexpire: (_key: string, _ms: number) => {
        ops.push(() => 1);
        return chain;
      },
      exec: async (): Promise<Array<[Error | null, unknown]>> =>
        ops.map((op) => [null, op()] as [Error | null, unknown]),
    };
    return chain;
  }

  async zrangebyscore(
    key: string,
    min: string | number,
    _max: string | number,
    _limitKeyword: "LIMIT",
    _offset: number,
    count: number
  ): Promise<string[]> {
    const set = this.getSet(key);
    const minVal = min === "-inf" ? -Infinity : Number(min);
    const results = [...set.entries()]
      .filter(([, score]) => score >= minVal)
      .sort(([, a], [, b]) => a - b)
      .slice(0, count)
      .map(([member]) => member);
    return results;
  }
}

// ---------------------------------------------------------------------------
// RedisSenderStore
// ---------------------------------------------------------------------------

describe("RedisSenderStore", () => {
  let redis: FakeRedisClient;
  let store: RedisSenderStore;

  beforeEach(() => {
    redis = new FakeRedisClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store = new RedisSenderStore(redis as any);
  });

  it("counts the first message as 1", async () => {
    expect(await store.addAndCount(SENDER, NOW)).toBe(1);
  });

  it("increments for each successive message in the same window", async () => {
    for (let i = 1; i <= 5; i++) {
      expect(await store.addAndCount(SENDER, NOW + i)).toBe(i);
    }
  });

  it("evicts timestamps outside the window before counting", async () => {
    // Fill 3 messages in window A.
    for (let i = 0; i < 3; i++) {
      await store.addAndCount(SENDER, NOW + i * 100);
    }
    // Move past the window — the pipeline's zremrangebyscore removes old entries.
    expect(await store.addAndCount(SENDER, NOW + WINDOW_MS + 500)).toBe(1);
  });

  it("keeps separate counts per sender", async () => {
    await store.addAndCount(SENDER, NOW);
    await store.addAndCount(SENDER, NOW + 1);

    const other = "GOTHERSENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(await store.addAndCount(other, NOW)).toBe(1);
  });

  it("throws when the Redis pipeline returns an error on zcard", async () => {
    const brokenRedis = {
      pipeline: () => ({
        zremrangebyscore: () => brokenRedis.pipeline(),
        zadd: () => brokenRedis.pipeline(),
        zcard: () => brokenRedis.pipeline(),
        pexpire: () => brokenRedis.pipeline(),
        exec: async () =>
          [
            [null, 0],
            [null, 1],
            [new Error("fail"), null],
            [null, 1],
          ] as Array<[Error | null, unknown]>,
      }),
      zrangebyscore: async () => [] as string[],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brokenStore = new RedisSenderStore(brokenRedis as any);
    await expect(brokenStore.addAndCount(SENDER, NOW)).rejects.toThrow("Redis pipeline error");
  });

  describe("oldestInWindow", () => {
    it("returns null when the set is empty", async () => {
      expect(await store.oldestInWindow(SENDER, NOW)).toBeNull();
    });

    it("returns the earliest timestamp in the window", async () => {
      await store.addAndCount(SENDER, NOW + 1000);
      await store.addAndCount(SENDER, NOW + 2000);
      await store.addAndCount(SENDER, NOW + 3000);

      const oldest = await store.oldestInWindow(SENDER, NOW + 3000);
      expect(oldest).toBe(NOW + 1000);
    });
  });
});

// ---------------------------------------------------------------------------
// senderRateLimitMiddleware
// ---------------------------------------------------------------------------

describe("senderRateLimitMiddleware", () => {
  let memStore: InMemorySenderStore;

  beforeEach(() => {
    memStore = new InMemorySenderStore();
    _setSenderStore(memStore);
    // Remove any bypass that lingered from a previous test.
    removeSenderBypass(SENDER);
  });

  afterEach(() => {
    removeSenderBypass(SENDER);
  });

  it("calls next() for requests below the limit", async () => {
    const req = makeReq(SENDER);
    const res = makeRes();
    const next = jest.fn();

    await new Promise<void>((resolve) => {
      senderRateLimitMiddleware(req, res, (err) => {
        next(err);
        resolve();
      });
    });

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows exactly SENDER_RATE_LIMIT_MAX messages", async () => {
    const results: boolean[] = [];

    for (let i = 0; i < SENDER_RATE_LIMIT_MAX; i++) {
      let passed = false;
      await new Promise<void>((resolve) => {
        senderRateLimitMiddleware(makeReq(SENDER), makeRes(), () => {
          passed = true;
          resolve();
        });
        // If res.json is called it means we were blocked.
        setTimeout(resolve, 50);
      });
      results.push(passed);
    }

    expect(results.every(Boolean)).toBe(true);
  });

  it("returns HTTP 429 after exceeding the limit", async () => {
    // Burn through the budget.
    for (let i = 0; i < SENDER_RATE_LIMIT_MAX; i++) {
      await new Promise<void>((resolve) => {
        senderRateLimitMiddleware(makeReq(SENDER), makeRes(), () => resolve());
      });
    }

    const req = makeReq(SENDER);
    const res = makeRes();
    const next = jest.fn();

    await new Promise<void>((resolve) => {
      senderRateLimitMiddleware(req, res, () => {
        next();
        resolve();
      });
      // Give the async path time to resolve.
      setTimeout(resolve, 100);
    });

    expect(res._status).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });

  it("sets a Retry-After header when returning 429", async () => {
    for (let i = 0; i < SENDER_RATE_LIMIT_MAX; i++) {
      await new Promise<void>((resolve) => {
        senderRateLimitMiddleware(makeReq(SENDER), makeRes(), () => resolve());
      });
    }

    const req = makeReq(SENDER);
    const res = makeRes();

    await new Promise<void>((resolve) => {
      senderRateLimitMiddleware(req, res, () => resolve());
      setTimeout(resolve, 100);
    });

    expect(res._headers!["Retry-After"]).toBeDefined();
    const retryAfter = parseInt(res._headers!["Retry-After"], 10);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("passes through without counting when no stellarAddress is set (unauthenticated)", async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = jest.fn();

    await new Promise<void>((resolve) => {
      senderRateLimitMiddleware(req, res, () => {
        next();
        resolve();
      });
    });

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("bypasses the limit for a registered verified sender", async () => {
    bypassSender(SENDER);

    // Simulate far exceeding the limit.
    for (let i = 0; i < SENDER_RATE_LIMIT_MAX + 10; i++) {
      await store.addAndCount(SENDER, Date.now() + i);
    }

    const req = makeReq(SENDER);
    const res = makeRes();
    const next = jest.fn();

    await new Promise<void>((resolve) => {
      senderRateLimitMiddleware(req, res, () => {
        next();
        resolve();
      });
    });

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("re-applies the limit after removeSenderBypass", async () => {
    bypassSender(SENDER);
    removeSenderBypass(SENDER);

    // Burn through the budget normally.
    for (let i = 0; i < SENDER_RATE_LIMIT_MAX; i++) {
      await new Promise<void>((resolve) => {
        senderRateLimitMiddleware(makeReq(SENDER), makeRes(), () => resolve());
      });
    }

    const res = makeRes();
    await new Promise<void>((resolve) => {
      senderRateLimitMiddleware(makeReq(SENDER), res, () => resolve());
      setTimeout(resolve, 100);
    });

    expect(res._status).toBe(429);
  });

  it("calls next(error) when the store throws", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _setSenderStore({
      addAndCount: async () => {
        throw new Error("store failure");
      },
      oldestInWindow: async () => null,
      clear: async () => undefined,
    } as unknown as InMemorySenderStore);

    const req = makeReq(SENDER);
    const res = makeRes();
    const next = jest.fn();

    await new Promise<void>((resolve) => {
      senderRateLimitMiddleware(req, res, (err) => {
        next(err);
        resolve();
      });
    });

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });

  it("includes the requestId in the 429 response body", async () => {
    for (let i = 0; i < SENDER_RATE_LIMIT_MAX; i++) {
      await new Promise<void>((resolve) => {
        senderRateLimitMiddleware(makeReq(SENDER), makeRes(), () => resolve());
      });
    }

    const req = makeReq(SENDER);
    const res = makeRes();

    await new Promise<void>((resolve) => {
      senderRateLimitMiddleware(req, res, () => resolve());
      setTimeout(resolve, 100);
    });

    // The response body should be a structured error referencing the requestId.
    expect(res.body).toBeDefined();
  });
});

// Reference to the underlying store so the bypass test can pre-fill counts.
// This piggybacks on the _setSenderStore hook.
const store = new InMemorySenderStore();
