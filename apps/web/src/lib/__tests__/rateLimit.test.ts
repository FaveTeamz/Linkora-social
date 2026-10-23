import {
  getRemainingActions,
  isAllowed,
  recordAction,
  resetRateLimits,
  setCustomRules,
} from "../rateLimit";

describe("sliding-window rate limits", () => {
  const rules = { post: { limit: 3, windowMs: 1_000 } };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00Z"));
    resetRateLimits();
    setCustomRules(rules);
  });

  afterEach(() => {
    resetRateLimits();
    setCustomRules(null);
    jest.useRealTimers();
  });

  it("allows the first N actions and rejects the N+1th", () => {
    for (let count = 0; count < rules.post.limit; count += 1) {
      expect(isAllowed("post")).toBe(true);
      recordAction("post");
    }

    expect(isAllowed("post")).toBe(false);
  });

  it("expires actions after the sliding window", () => {
    for (let count = 0; count < rules.post.limit; count += 1) recordAction("post");
    expect(isAllowed("post")).toBe(false);

    jest.advanceTimersByTime(rules.post.windowMs + 1);

    expect(isAllowed("post")).toBe(true);
    expect(getRemainingActions("post")).toBe(rules.post.limit);
  });

  it("reports remaining actions as the window fills", () => {
    expect(getRemainingActions("post")).toBe(3);
    recordAction("post");
    expect(getRemainingActions("post")).toBe(2);
    recordAction("post");
    expect(getRemainingActions("post")).toBe(1);
    recordAction("post");
    expect(getRemainingActions("post")).toBe(0);
  });
});
