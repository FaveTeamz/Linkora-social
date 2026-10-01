import { query, closeDbPool, getDbPool } from "../db";

describe("PostgreSQL Full-Text Search (FTS) Integration", () => {
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      const res = await query("SELECT 1 AS connected");
      isDbAvailable = res.rows[0]?.connected === 1;

      if (isDbAvailable) {
        // Setup temporary search test table with tsvector column
        await query(`
          CREATE TABLE IF NOT EXISTS test_posts (
            id SERIAL PRIMARY KEY,
            content TEXT NOT NULL,
            tsv TSVECTOR
          );
        `);

        await query(`
          INSERT INTO test_posts (content, tsv) VALUES
          ('Building decentralized applications on Stellar and Soroban', to_tsvector('english', 'Building decentralized applications on Stellar and Soroban')),
          ('Linkora social protocol integrates on-chain tipping primitives', to_tsvector('english', 'Linkora social protocol integrates on-chain tipping primitives')),
          ('Exploring web3 smart contracts in Rust', to_tsvector('english', 'Exploring web3 smart contracts in Rust'));
        `);
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      try {
        await query("DROP TABLE IF EXISTS test_posts");
      } catch {
        // ignore cleanup error
      }
    }
    await closeDbPool();
  });

  it("performs full-text search and computes ts_rank when PostgreSQL is available", async () => {
    if (!isDbAvailable) {
      console.warn("PostgreSQL container not reachable; skipping live FTS query test.");
      return;
    }

    const searchQuery = "Stellar & Soroban";
    const res = await query<{ id: number; content: string; rank: number }>(
      `
      SELECT id, content, ts_rank(tsv, to_tsquery('english', $1)) AS rank
      FROM test_posts
      WHERE tsv @@ to_tsquery('english', $1)
      ORDER BY rank DESC;
      `,
      [searchQuery]
    );

    expect(res.rows.length).toBeGreaterThanOrEqual(1);
    expect(res.rows[0].content).toContain("Stellar");
    expect(Number(res.rows[0].rank)).toBeGreaterThan(0);
  });
});
