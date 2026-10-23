import { decodeCursor, decodeOffsetCursor, encodeCursor, makeCursorPage } from "../pagination.js";

describe("cursor pagination", () => {
  it("encodes and decodes string and numeric cursor values", () => {
    expect(decodeCursor(encodeCursor({ field: "created_ledger", value: 42 }))).toEqual({
      field: "created_ledger",
      value: 42,
    });
    expect(decodeCursor(encodeCursor({ field: "address", value: "GABC" }))).toEqual({
      field: "address",
      value: "GABC",
    });
  });

  it("rejects malformed base64, JSON, and cursor payloads", () => {
    expect(() => decodeCursor("not base64!")).toThrow(/base64/);
    expect(() => decodeCursor(btoa("not json"))).toThrow(/JSON/);
    expect(() => encodeCursor({ field: "", value: 1 })).toThrow(/field/);
    expect(() => decodeCursor(btoa(JSON.stringify({ field: "id", value: null })))).toThrow(
      /field and a string or finite number value/
    );
  });

  it("validates offsets and builds next-page cursors only for full pages", () => {
    const cursor = encodeCursor({ field: "offset", value: 20 });
    expect(decodeOffsetCursor(cursor)).toBe(20);
    expect(decodeOffsetCursor()).toBe(0);
    expect(() => decodeOffsetCursor(encodeCursor({ field: "id", value: 20 }))).toThrow(/Offset/);
    expect(makeCursorPage(["a", "b"], 2, 20).nextCursor).toBe(
      encodeCursor({ field: "offset", value: 22 })
    );
    expect(makeCursorPage(["a"], 2, 20).nextCursor).toBeNull();
  });
});
