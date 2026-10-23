import express, { type Application, Request, Response } from "express";
import helmet from "helmet";
import { Pool } from "pg";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const DATABASE_URL = process.env.DATABASE_URL;

const app: Application = express();
app.use(helmet());
app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({ connectionString: DATABASE_URL });

// ── Health endpoint ────────────────────────────────────────────────────────
app.get("/health", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "search", db: "connected" });
  } catch (_err) {
    res.status(503).json({ status: "error", service: "search", db: "unreachable" });
  }
});

// ── Readiness probe ────────────────────────────────────────────────────────
app.get("/health/ready", (_req: Request, res: Response) => {
  res.json({ status: "ready", service: "search" });
});

// ── Search helpers ─────────────────────────────────────────────────────────
type SearchType = "posts" | "profiles" | "all";

interface Cursor {
  rank: number;
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.rank === "number" && typeof parsed?.id === "string") {
      return { rank: parsed.rank, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

// Build a safe tsquery from user input: split on whitespace, strip tsquery
// operators, and join terms with '&' so to_tsquery receives valid syntax.
function buildTsQuery(q: string): string {
  const terms = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length > 0);
  return terms.join(" & ");
}

// ── Search endpoint ────────────────────────────────────────────────────────
// GET /search?q=<query>&type=posts|profiles|all&limit=20&cursor=<opaque>
app.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  const type = String(req.query.type ?? "all") as SearchType;
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
  const cursorRaw = req.query.cursor ? String(req.query.cursor) : null;

  if (!q) {
    res.status(400).json({ error: "query parameter 'q' is required" });
    return;
  }

  if (type !== "posts" && type !== "profiles" && type !== "all") {
    res.status(400).json({ error: "query parameter 'type' must be posts, profiles, or all" });
    return;
  }

  const tsQuery = buildTsQuery(q);
  if (!tsQuery) {
    res.json({ type, results: [], next_cursor: null });
    return;
  }

  let cursor: Cursor | null = null;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      res.status(400).json({ error: "invalid cursor" });
      return;
    }
  }

  try {
    const results: Array<Record<string, unknown>> = [];

    if (type === "posts" || type === "all") {
      const { rows } = await pool.query(
        `SELECT id, author, content, created_at,
                ts_rank(fts, to_tsquery('english', $1)) AS rank
           FROM posts
          WHERE fts @@ to_tsquery('english', $1)
            AND ($2::float8 IS NULL OR (ts_rank(fts, to_tsquery('english', $1)), id) < ($2::float8, $3::uuid))
          ORDER BY rank DESC, id DESC
          LIMIT $4`,
        [tsQuery, cursor?.rank ?? null, cursor?.id ?? null, limit]
      );
      for (const row of rows) {
        results.push({ kind: "post", ...row });
      }
    }

    if (type === "profiles" || type === "all") {
      const { rows } = await pool.query(
        `SELECT address, display_name, bio, avatar_url,
                ts_rank(to_tsvector('english', coalesce(display_name,'') || ' ' || coalesce(bio,'')),
                        to_tsquery('english', $1)) AS rank
           FROM profiles
          WHERE to_tsvector('english', coalesce(display_name,'') || ' ' || coalesce(bio,''))
                @@ to_tsquery('english', $1)
            AND ($2::float8 IS NULL OR (ts_rank(to_tsvector('english', coalesce(display_name,'') || ' ' || coalesce(bio,'')), to_tsquery('english', $1)), address) < ($2::float8, $3::text))
          ORDER BY rank DESC, address DESC
          LIMIT $4`,
        [tsQuery, cursor?.rank ?? null, cursor?.id ?? null, limit]
      );
      for (const row of rows) {
        results.push({ kind: "profile", ...row });
      }
    }

    // Merge and rank across kinds when type=all, then trim to limit.
    results.sort((a, b) => {
      const ra = Number(a.rank ?? 0);
      const rb = Number(b.rank ?? 0);
      if (rb !== ra) return rb - ra;
      return String(a.id ?? a.address ?? "").localeCompare(String(b.id ?? b.address ?? ""));
    });
    const page = results.slice(0, limit);

    let nextCursor: string | null = null;
    if (page.length === limit) {
      const last = page[page.length - 1];
      nextCursor = encodeCursor({
        rank: Number(last.rank ?? 0),
        id: String(last.id ?? last.address ?? ""),
      });
    }

    res.json({ type, results: page, next_cursor: nextCursor });
  } catch (_err) {
    res.status(500).json({ error: "search query failed" });
  }
});

// ── Start server ───────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[search] listening on port ${PORT}`);
});

// Graceful shutdown
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default app;
