import { getDbPool, closeDbPool } from "../db";
import type { PoolClient } from "pg";

describe("PostgreSQL Full-Text Search (FTS) Integration", () => {
  let client: PoolClient | undefined;

  beforeAll(async () => {
    try {
      client = await getDbPool().connect();
      await client.query(`
        CREATE TEMP TABLE search_test_posts (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          document TSVECTOR NOT NULL
        ) ON COMMIT PRESERVE ROWS
      `);
      await client.query(`
        INSERT INTO search_test_posts (id, content, document) VALUES
          ('exact', 'stellar', to_tsvector('english', 'stellar')),
          ('partial', 'stellar social protocol and community', to_tsvector('english', 'stellar social protocol and community')),
          ('unrelated', 'decentralized finance on another network', to_tsvector('english', 'decentralized finance on another network'))
      `);
    } catch {
      client?.release();
      client = undefined;
    }
  });

  afterAll(async () => {
    client?.release();
    await closeDbPool();
  });

  it("indexes and finds a post by a term in its content", async () => {
    if (!client) {
      console.warn("PostgreSQL test service is unavailable; skipping live FTS coverage.");
      return;
    }

    const result = await client.query<{ id: string; content: string }>(
      `SELECT id, content FROM search_test_posts WHERE document @@ plainto_tsquery('english', $1)`,
      ["stellar"],
    );
    expect(result.rows.map((row) => row.id)).toEqual(expect.arrayContaining(["exact", "partial"]));
  });

  it("removes a deleted post from subsequent search results", async () => {
    if (!client) return;
    await client.query("DELETE FROM search_test_posts WHERE id = $1", ["exact"]);
    const result = await client.query<{ id: string }>(
      `SELECT id FROM search_test_posts WHERE document @@ plainto_tsquery('english', $1)`,
      ["stellar"],
    );
    expect(result.rows.map((row) => row.id)).not.toContain("exact");
  });

  it("ranks the exact short match above a longer partial match", async () => {
    if (!client) return;
    await client.query(
      `INSERT INTO search_test_posts (id, content, document)
       VALUES ('exact', 'stellar', to_tsvector('english', 'stellar'))
       ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, document = EXCLUDED.document`,
    );
    const result = await client.query<{ id: string; rank: number }>(
      `SELECT id, ts_rank(document, plainto_tsquery('english', $1), 2) AS rank
       FROM search_test_posts
       WHERE document @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC`,
      ["stellar"],
    );
    expect(result.rows[0]?.id).toBe("exact");
    expect(Number(result.rows[0]?.rank)).toBeGreaterThan(Number(result.rows[1]?.rank));
  });
});
