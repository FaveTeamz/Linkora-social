import type { Pool } from 'pg';

export type SearchType = 'posts' | 'profiles' | 'all';

export interface SearchResult {
  id: string;
  type: 'post' | 'profile';
  rank: number;
  title?: string;
  username?: string;
  snippet?: string;
}

export interface SearchParams {
  q: string;
  type: SearchType;
  cursor?: string;
  limit?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface CursorPayload {
  rank: number;
  id: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.rank === 'number' && typeof parsed?.id === 'string') {
      return { rank: parsed.rank, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function buildTsQuery(q: string): string {
  // Convert free-text input into a safe tsquery string: split on whitespace,
  // strip tsquery operators, and join terms with AND.
  const terms = q
    .split(/\s+/)
    .map((t) => t.replace(/[&|!():*'"<>]/g, '').trim())
    .filter((t) => t.length > 0);
  if (terms.length === 0) return '';
  return terms.map((t) => `${t}:*`).join(' & ');
}

interface Row {
  id: string;
  type: 'post' | 'profile';
  rank: number;
  title: string | null;
  username: string | null;
  snippet: string | null;
}

export async function search(pool: Pool, params: SearchParams): Promise<SearchResponse> {
  const tsquery = buildTsQuery(params.q);
  if (!tsquery) {
    return { results: [], nextCursor: null };
  }

  const limit = normalizeLimit(params.limit);
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
  const cursorRank = cursor ? cursor.rank : null;
  const cursorId = cursor ? cursor.id : null;

  const includePosts = params.type === 'posts' || params.type === 'all';
  const includeProfiles = params.type === 'profiles' || params.type === 'all';

  const parts: string[] = [];
  const values: unknown[] = [tsquery];

  if (includePosts) {
    parts.push(`
      SELECT
        p.id::text AS id,
        'post'::text AS type,
        ts_rank(p.fts, to_tsquery('simple', $1)) AS rank,
        p.title AS title,
        NULL::text AS username,
        left(p.body, 200) AS snippet
      FROM posts p
      WHERE p.fts @@ to_tsquery('simple', $1)
    `);
  }

  if (includeProfiles) {
    parts.push(`
      SELECT
        pr.id::text AS id,
        'profile'::text AS type,
        ts_rank(to_tsvector('simple', coalesce(pr.username, '')), to_tsquery('simple', $1)) AS rank,
        NULL::text AS title,
        pr.username AS username,
        NULL::text AS snippet
      FROM profiles pr
      WHERE to_tsvector('simple', coalesce(pr.username, '')) @@ to_tsquery('simple', $1)
    `);
  }

  if (parts.length === 0) {
    return { results: [], nextCursor: null };
  }

  const union = parts.join('\nUNION ALL\n');

  let where = '';
  if (cursorRank !== null && cursorId !== null) {
    values.push(cursorRank, cursorId);
    where = `WHERE (rank < $2 OR (rank = $2 AND id > $3))`;
  }

  values.push(limit + 1);
  const limitParam = `$${values.length}`;

  const sql = `
    SELECT id, type, rank, title, username, snippet
    FROM (${union}) AS combined
    ${where}
    ORDER BY rank DESC, id ASC
    LIMIT ${limitParam}
  `;

  const { rows } = await pool.query<Row>(sql, values);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const results: SearchResult[] = page.map((row) => ({
    id: row.id,
    type: row.type,
    rank: Number(row.rank),
    ...(row.title !== null ? { title: row.title } : {}),
    ...(row.username !== null ? { username: row.username } : {}),
    ...(row.snippet !== null ? { snippet: row.snippet } : {}),
  }));

  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ rank: Number(last.rank), id: last.id }) : null;

  return { results, nextCursor };
}
