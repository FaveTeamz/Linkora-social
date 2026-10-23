export interface PgQueryable {
  query<T>(
    text: string,
    values: unknown[]
  ): Promise<{ rows: T[] }>;
}

export interface ReputationLeaderboardEntry {
  address: string;
  username: string | null;
  score: number;
  tier: string;
}

export interface ReputationLeaderboardPage {
  entries: ReputationLeaderboardEntry[];
  nextCursor: string | null;
}

interface Cursor { score: number; address: string }
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: ReputationLeaderboardPage }>();

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value?: string): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (!Number.isSafeInteger(parsed.score) || typeof parsed.address !== "string" || !parsed.address) return undefined;
    return { score: parsed.score as number, address: parsed.address };
  } catch {
    return undefined;
  }
}

function tierForScore(score: number): string {
  if (score >= 8_000) return "legendary";
  if (score >= 6_000) return "diamond";
  if (score >= 4_000) return "gold";
  if (score >= 2_000) return "silver";
  return "bronze";
}

/** Fetch a cached page of creators ordered by score, then address. */
export async function getReputationLeaderboard(
  pool: PgQueryable,
  limit = 50,
  cursorValue?: string,
  now = Date.now()
): Promise<ReputationLeaderboardPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("limit must be between 1 and 100");
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) throw new TypeError("cursor is invalid");
  const key = `${limit}:${cursorValue ?? ""}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) cache.delete(key);

  const result = await pool.query<{
    user_address: string;
    username: string | null;
    score: number;
  }>(
    `SELECT scores.user_address, profiles.username, scores.score
       FROM reputation_scores AS scores
       LEFT JOIN profiles ON profiles.address = scores.user_address
      WHERE ($1::integer IS NULL OR scores.score < $1 OR
             (scores.score = $1 AND scores.user_address > $2))
      ORDER BY scores.score DESC, scores.user_address ASC
      LIMIT $3`,
    [cursor?.score ?? null, cursor?.address ?? null, limit + 1]
  );

  const rows = result.rows;
  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit).map((row) => ({
    address: row.user_address,
    username: row.username,
    score: Number(row.score),
    tier: tierForScore(Number(row.score)),
  }));
  const page = {
    entries,
    nextCursor: hasMore && entries.length
      ? encodeCursor({ score: entries[entries.length - 1]!.score, address: entries[entries.length - 1]!.address })
      : null,
  };
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value: page });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return page;
}

export function clearReputationLeaderboardCache(): void {
  cache.clear();
}
