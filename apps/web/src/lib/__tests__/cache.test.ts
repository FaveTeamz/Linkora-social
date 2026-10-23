import { MemoryCache } from "../cache";

describe("MemoryCache", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00Z")));
  afterEach(() => jest.useRealTimers());

  it("stores and retrieves values before their TTL expires", () => {
    const cache = new MemoryCache<string>(500, 1_000);
    cache.set("profile:alice", "GADDRESS");

    expect(cache.get("profile:alice")).toBe("GADDRESS");
    jest.advanceTimersByTime(999);
    expect(cache.get("profile:alice")).toBe("GADDRESS");
  });

  it("returns undefined for expired entries", () => {
    const cache = new MemoryCache<string>(500, 1_000);
    cache.set("profile:alice", "GADDRESS");

    jest.advanceTimersByTime(1_000);

    expect(cache.get("profile:alice")).toBeUndefined();
  });

  it("deletes entries and invalidates matching key prefixes", () => {
    const cache = new MemoryCache<number>();
    cache.set("profile:alice", 1);
    cache.set("profile:bob", 2);
    cache.set("post:1", 3);

    expect(cache.delete("profile:alice")).toBe(true);
    expect(cache.invalidatePrefix("profile:")).toBe(1);
    expect(cache.get("profile:bob")).toBeUndefined();
    expect(cache.get("post:1")).toBe(3);
  });

  it("evicts the least recently used entry at the 500-entry limit", () => {
    const cache = new MemoryCache<number>();
    for (let index = 0; index < 500; index += 1) cache.set(`key:${index}`, index);

    expect(cache.get("key:0")).toBe(0);
    cache.set("key:500", 500);

    expect(cache.get("key:0")).toBe(0);
    expect(cache.get("key:1")).toBeUndefined();
    expect(cache.get("key:500")).toBe(500);
  });
});
