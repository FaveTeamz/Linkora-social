import {
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  mergePaginatedResults,
  paginationToQuery,
} from "../pagination";

describe("cursor pagination helpers", () => {
  it.each(["post-α", 42])("round-trips cursor value %p", (value) => {
    expect(decodeCursor(encodeCursor(value))).toBe(value);
  });

  it.each(["", "not a cursor", "eyJvayI6dHJ1ZX0"])("rejects malformed cursor %p", (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError);
  });

  it("builds URL parameters and encodes the cursor", () => {
    const query = paginationToQuery({
      cursor: "post/α",
      limit: 20,
      direction: "older",
      unused: null,
    });

    expect(query.get("cursor")).toBe(encodeCursor("post/α"));
    expect(query.get("limit")).toBe("20");
    expect(query.get("direction")).toBe("older");
    expect(query.has("unused")).toBe(false);
  });

  it("deduplicates page results by id and uses the newest duplicate", () => {
    const merged = mergePaginatedResults(
      [{ id: 1, title: "old" }, { id: 2, title: "two" }],
      [{ id: 1, title: "updated" }, { id: 3, title: "three" }]
    );

    expect(merged).toEqual([
      { id: 1, title: "updated" },
      { id: 2, title: "two" },
      { id: 3, title: "three" },
    ]);
  });
});
