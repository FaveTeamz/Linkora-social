export interface Cursor {
  field: string;
  value: string | number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Encode a field/value cursor as UTF-8 JSON in standard base64. */
export function encodeCursor(cursor: Cursor): string {
  validateCursor(cursor);
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

/** Decode and validate a base64 JSON cursor. */
export function decodeCursor(encoded: string): Cursor {
  if (
    typeof encoded !== "string" ||
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new TypeError("Cursor must be a non-empty standard base64 string");
  }

  let parsed: unknown;
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new TypeError("Cursor must contain valid base64-encoded JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Cursor payload must be an object");
  }

  const cursor = parsed as Partial<Cursor>;
  if (
    typeof cursor.field !== "string" ||
    cursor.field.trim().length === 0 ||
    (typeof cursor.value !== "string" && typeof cursor.value !== "number") ||
    (typeof cursor.value === "number" && !Number.isFinite(cursor.value))
  ) {
    throw new TypeError("Cursor must contain a non-empty field and a string or finite number value");
  }
  return { field: cursor.field, value: cursor.value };
}

/** Read the numeric offset encoded by an SDK offset cursor. */
export function decodeOffsetCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  const decoded = decodeCursor(cursor);
  if (
    decoded.field !== "offset" ||
    typeof decoded.value !== "number" ||
    !Number.isSafeInteger(decoded.value) ||
    decoded.value < 0
  ) {
    throw new TypeError("Offset cursor must contain a non-negative safe integer value");
  }
  return decoded.value;
}

/** Create a next-page cursor only when the returned page is full. */
export function makeCursorPage<T>(items: T[], limit: number, offset: number): CursorPage<T> {
  return {
    items,
    nextCursor:
      items.length === limit ? encodeCursor({ field: "offset", value: offset + items.length }) : null,
  };
}

function validateCursor(cursor: Cursor): void {
  if (
    !cursor ||
    typeof cursor.field !== "string" ||
    cursor.field.trim().length === 0 ||
    (typeof cursor.value !== "string" && typeof cursor.value !== "number") ||
    (typeof cursor.value === "number" && !Number.isFinite(cursor.value))
  ) {
    throw new TypeError("Cursor must contain a non-empty field and a string or finite number value");
  }
}
