export class InvalidCursorError extends Error {
  constructor(message = "Invalid pagination cursor") {
    super(message);
    this.name = "InvalidCursorError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type CursorValue = string | number;

/** Encodes a string or number cursor as URL-safe base64 JSON. */
export function encodeCursor(value: CursorValue): string {
  if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new InvalidCursorError("Cursor must be a string or a finite number");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Decodes a URL-safe cursor created by {@link encodeCursor}. */
export function decodeCursor(cursor: string): CursorValue {
  if (!cursor || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new InvalidCursorError();
  try {
    const base64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof value !== "string" &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new InvalidCursorError();
    }
    return value;
  } catch (error) {
    if (error instanceof InvalidCursorError) throw error;
    throw new InvalidCursorError();
  }
}

export type PaginationQueryValue = string | number | boolean | null | undefined;
export type PaginationQuery = Record<string, PaginationQueryValue> & { cursor?: CursorValue };

/** Converts pagination and filter values into URL parameters, encoding cursor values. */
export function paginationToQuery(params: PaginationQuery): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (key === "cursor") {
      if (typeof value !== "string" && typeof value !== "number") {
        throw new InvalidCursorError("Cursor must be a string or a finite number");
      }
      query.set(key, encodeCursor(value));
    } else {
      query.set(key, String(value));
    }
  }
  return query;
}

/** Merges pages in order, updating duplicate records with the newest copy. */
export function mergePaginatedResults<T extends { id: string | number }>(
  current: readonly T[],
  next: readonly T[]
): T[] {
  const merged: T[] = [];
  const indexById = new Map<T["id"], number>();

  for (const item of [...current, ...next]) {
    const existingIndex = indexById.get(item.id);
    if (existingIndex === undefined) {
      indexById.set(item.id, merged.length);
      merged.push(item);
    } else {
      merged[existingIndex] = item;
    }
  }
  return merged;
}
