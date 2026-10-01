import { Pool } from "pg";

export interface SearchResult {
  id: string;
  type: "profile" | "post";
  /** Stellar address for profiles, post ID for posts */
  ref: string;
  /** Display title — username for profiles, truncated content for posts */
  title: string;
  /** Optional short excerpt with matched terms highlighted */
  snippet: string | null;
  /** Postgres ts_rank score (higher = more relevant) */
  rank: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Full-text search across profiles (username, bio) and posts (content).
 *
 * Uses PostgreSQL `to_tsquery` with a `websearch_to_tsquery` fallback so
 * callers can pass raw user input without manual escaping.
 *
 * @param pool   Active PostgreSQL connection pool.
 * @param query  Raw search string from the user.
 * @param limit  Maximum number of results (clamped to 1–{@link MAX_LIMIT}).
 */
export async function searchAll(
  pool: Pool,
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<SearchResult[]> {
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

  // Use parameterised queries throughout to prevent SQL injection.
  const sql = `
    SELECT
      gen_random_uuid()::text      AS id,
      'profile'                    AS type,
      address                      AS ref,
      COALESCE(username, address)  AS title,
      bio                          AS snippet,
      ts_rank(
        to_tsvector('english', COALESCE(username,'') || ' ' || COALESCE(bio,'')),
        websearch_to_tsquery('english', $1)
      )                            AS rank
    FROM profiles
    WHERE
      to_tsvector('english', COALESCE(username,'') || ' ' || COALESCE(bio,''))
        @@ websearch_to_tsquery('english', $1)

    UNION ALL

    SELECT
      gen_random_uuid()::text                       AS id,
      'post'                                        AS type,
      id::text                                      AS ref,
      LEFT(content, 80)                             AS title,
      LEFT(content, 160)                            AS snippet,
      ts_rank(
        to_tsvector('english', COALESCE(content,'')),
        websearch_to_tsquery('english', $1)
      )                                             AS rank
    FROM posts
    WHERE
      to_tsvector('english', COALESCE(content,''))
        @@ websearch_to_tsquery('english', $1)

    ORDER BY rank DESC
    LIMIT $2
  `;

  const { rows } = await pool.query<SearchResult>(sql, [query, safeLimit]);
  return rows;
}

/**
 * Full-text search limited to profiles only.
 */
export async function searchProfiles(
  pool: Pool,
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<SearchResult[]> {
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

  const sql = `
    SELECT
      gen_random_uuid()::text      AS id,
      'profile'                    AS type,
      address                      AS ref,
      COALESCE(username, address)  AS title,
      bio                          AS snippet,
      ts_rank(
        to_tsvector('english', COALESCE(username,'') || ' ' || COALESCE(bio,'')),
        websearch_to_tsquery('english', $1)
      )                            AS rank
    FROM profiles
    WHERE
      to_tsvector('english', COALESCE(username,'') || ' ' || COALESCE(bio,''))
        @@ websearch_to_tsquery('english', $1)
    ORDER BY rank DESC
    LIMIT $2
  `;

  const { rows } = await pool.query<SearchResult>(sql, [query, safeLimit]);
  return rows;
}

/**
 * Full-text search limited to posts only.
 */
export async function searchPosts(
  pool: Pool,
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<SearchResult[]> {
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

  const sql = `
    SELECT
      gen_random_uuid()::text                       AS id,
      'post'                                        AS type,
      id::text                                      AS ref,
      LEFT(content, 80)                             AS title,
      LEFT(content, 160)                            AS snippet,
      ts_rank(
        to_tsvector('english', COALESCE(content,'')),
        websearch_to_tsquery('english', $1)
      )                                             AS rank
    FROM posts
    WHERE
      to_tsvector('english', COALESCE(content,''))
        @@ websearch_to_tsquery('english', $1)
    ORDER BY rank DESC
    LIMIT $2
  `;

  const { rows } = await pool.query<SearchResult>(sql, [query, safeLimit]);
  return rows;
}
