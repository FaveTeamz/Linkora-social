/**
 * Client-side Rate Limiting Module (Sliding Window Algorithm)
 * ==========================================================
 *
 * Sliding Window Approach:
 * ────────────────────────
 * This module implements a client-side sliding-window rate limiter designed to regulate
 * user interactions and API request bursts before they reach network and on-chain tiers.
 *
 * How it works:
 * 1. Timestamp Tracking: Each action records a millisecond timestamp of when it occurred
 *    (stored per action bucket in `sessionStorage` in the browser, or in an in-memory Map
 *    when running on the server or in non-browser test environments).
 * 2. Continuous Sliding Window: When evaluating if an action is permitted (`isAllowed`),
 *    any timestamps older than `(currentTime - windowMs)` are evicted.
 * 3. Boundary Smoothness: Unlike fixed-window counters that reset at arbitrary intervals
 *    (which permit an attacker or rapid user to exhaust 2x the limit across window boundaries),
 *    the sliding window continuously checks the exact window spanning the last `windowMs`.
 * 4. Automatic Eviction: Inactive keys and expired timestamps are filtered out on every
 *    access and can be reset globally using `resetRateLimits()`.
 *
 * Customising Limits in Tests:
 * ────────────────────────────
 * Test suites often need lower thresholds or deterministic time advancement to verify
 * rate-limiting behaviors and edge cases without waiting for actual real-time delays.
 *
 * 1. Overriding Rules Programmatically:
 *    Call `setCustomRules({ ... })` to override default thresholds, or pass a custom rules
 *    record directly to `isAllowed(action, customRules)` and `getRemainingActions(action, customRules)`:
 *    ```ts
 *    import { setCustomRules, resetRateLimits, isAllowed } from "@/lib/rateLimit";
 *
 *    beforeEach(() => {
 *      resetRateLimits();
 *      setCustomRules({
 *        post: { limit: 2, windowMs: 1000 },
 *      });
 *    });
 *
 *    afterEach(() => {
 *      setCustomRules(null); // Restore defaults
 *    });
 *    ```
 *
 * 2. Mocking Time with Jest Fake Timers:
 *    When testing window expiration and remaining action count recovery:
 *    ```ts
 *    jest.useFakeTimers();
 *
 *    recordAction("post");
 *    recordAction("post");
 *    expect(isAllowed("post")).toBe(false);
 *
 *    // Advance time past the sliding window
 *    jest.advanceTimersByTime(60_000);
 *    expect(isAllowed("post")).toBe(true);
 *
 *    jest.useRealTimers();
 *    ```
 */

export interface RateLimitRule {
  /** Maximum number of allowed occurrences of this action within the window. */
  limit: number;
  /** Duration of the sliding window in milliseconds. */
  windowMs: number;
}

export type ActionType = "post" | "comment" | "like" | "follow" | "tip" | "message";

/**
 * Default rate-limiting rules applied across standard user actions.
 */
export const DEFAULT_RULES: Record<ActionType, RateLimitRule> = {
  /**
   * Post creation limit (5 actions per 60,000ms window).
   *
   * Rationale:
   * Submitting a post generates Soroban smart contract invocations and consumes network
   * resources. A 5/minute cap protects against automated spam scripts, duplicate form
   * submissions, and ledger transaction queue saturation.
   */
  post: {
    limit: 5,
    windowMs: 60_000,
  },

  /**
   * Comment creation limit (15 actions per 60,000ms window).
   *
   * Rationale:
   * Comments require contract storage rent and indexer ingest. While users post comments
   * more frequently than main posts during discussions, a 15/minute ceiling prevents rapid-fire
   * spam bots and thread flooding.
   */
  comment: {
    limit: 15,
    windowMs: 60_000,
  },

  /**
   * Post like/unlike limit (30 actions per 60,000ms window).
   *
   * Rationale:
   * Likes are interactive and occur frequently during active feed scrolling. A 30/minute
   * limit accommodates genuine human browsing while halting aggressive like-farming scripts
   * that distort ranking algorithms and explore feeds.
   */
  like: {
    limit: 30,
    windowMs: 60_000,
  },

  /**
   * Follow/unfollow relationship limit (10 actions per 60,000ms window).
   *
   * Rationale:
   * Modifying social graph connections mutates contract state tables. Capping follows at
   * 10/minute discourages abusive mass-follow-unfollow growth tactics and reduces strain
   * on the social graph indexer.
   */
  follow: {
    limit: 10,
    windowMs: 60_000,
  },

  /**
   * Tipping limit (5 actions per 60,000ms window).
   *
   * Rationale:
   * Tipping involves on-chain asset transfers and contract escrows. A conservative limit of
   * 5/minute guards users against accidental multi-click balance transfers and aligns with
   * smart contract tip cooldown requirements.
   */
  tip: {
    limit: 5,
    windowMs: 60_000,
  },

  /**
   * Direct messaging dispatch limit (20 actions per 60,000ms window).
   *
   * Rationale:
   * Messages are sent through the Linkora DM relay service over encrypted channels. A 20/minute
   * cap ensures seamless real-time conversation while mitigating relay denial-of-service,
   * spamming recipient inboxes, and socket buffer overflow.
   */
  message: {
    limit: 20,
    windowMs: 60_000,
  },
};

// In-memory fallback for environments without sessionStorage (e.g. Node / SSR / Jest)
const memoryStore = new Map<string, number[]>();

// Custom rules override (useful in test suites)
let customRulesOverride: Partial<Record<string, RateLimitRule>> | null = null;

const STORAGE_PREFIX = "linkora_ratelimit_";

/**
 * Configure custom rate limit rules (e.g. during unit tests).
 * Pass `null` to reset back to DEFAULT_RULES.
 */
export function setCustomRules(rules: Partial<Record<string, RateLimitRule>> | null): void {
  customRulesOverride = rules;
}

function getRule(action: string, customRules?: Record<string, RateLimitRule>): RateLimitRule {
  if (customRules && customRules[action]) {
    return customRules[action];
  }
  if (customRulesOverride && customRulesOverride[action]) {
    return customRulesOverride[action]!;
  }
  if (action in DEFAULT_RULES) {
    return DEFAULT_RULES[action as ActionType];
  }
  return { limit: 10, windowMs: 60_000 };
}

function getStorageKey(action: string): string {
  return `${STORAGE_PREFIX}${action}`;
}

function loadTimestamps(action: string): number[] {
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      const raw = window.sessionStorage.getItem(getStorageKey(action));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((t) => typeof t === "number");
        }
      }
    } catch {
      // Fallback to memoryStore if sessionStorage access throws
    }
  }
  return memoryStore.get(action) ?? [];
}

function saveTimestamps(action: string, timestamps: number[]): void {
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(getStorageKey(action), JSON.stringify(timestamps));
      return;
    } catch {
      // Fallback to memoryStore
    }
  }
  memoryStore.set(action, timestamps);
}

/**
 * Prunes expired timestamps outside the rolling window.
 */
function getActiveTimestamps(action: string, windowMs: number, now: number): number[] {
  const timestamps = loadTimestamps(action);
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

/**
 * Checks whether an action is permitted under the sliding window rate limit.
 *
 * @param action - Action identifier (e.g. "post", "like", "comment")
 * @param rules - Optional custom rule overrides
 * @returns true if the action is allowed, false if rate limit is reached
 */
export function isAllowed(action: string, rules?: Record<string, RateLimitRule>): boolean {
  const rule = getRule(action, rules);
  const now = Date.now();
  const active = getActiveTimestamps(action, rule.windowMs, now);
  return active.length < rule.limit;
}

/**
 * Records an occurrence of an action at the current timestamp.
 *
 * @param action - Action identifier
 * @param timestamp - Optional custom timestamp (defaults to Date.now())
 */
export function recordAction(action: string, timestamp: number = Date.now()): void {
  const rule = getRule(action);
  const active = getActiveTimestamps(action, rule.windowMs, timestamp);
  active.push(timestamp);
  saveTimestamps(action, active);
}

/**
 * Returns the number of remaining actions permitted in the current sliding window.
 *
 * @param action - Action identifier
 * @param rules - Optional custom rule overrides
 * @returns Number of actions remaining before rate limiting kicks in
 */
export function getRemainingActions(action: string, rules?: Record<string, RateLimitRule>): number {
  const rule = getRule(action, rules);
  const now = Date.now();
  const active = getActiveTimestamps(action, rule.windowMs, now);
  return Math.max(0, rule.limit - active.length);
}

/**
 * Clears all stored rate limit timestamps (for testing and session resets).
 */
export function resetRateLimits(): void {
  memoryStore.clear();
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }
}
