import express, { Request, Response } from "express";
import helmet from "helmet";
import { Pool } from "pg";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
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

// ── Search endpoint ────────────────────────────────────────────────────────
// GET /search?q=<query>&type=profiles|posts&limit=20&offset=0
app.get("/search", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  const type = String(req.query.type ?? "posts");
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 100);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  if (!q) {
    res.status(400).json({ error: "query parameter 'q' is required" });
    return;
  }

  try {
    if (type === "profiles") {
      const { rows } = await pool.query(
        `SELECT address, display_name, bio, avatar_url
           FROM profiles
          WHERE to_tsvector('english', coalesce(display_name,'') || ' ' || coalesce(bio,''))
                @@ plainto_tsquery('english', $1)
          ORDER BY display_name
          LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );
      res.json({ type: "profiles", results: rows });
    } else {
      const { rows } = await pool.query(
        `SELECT id, author, content, created_at
           FROM posts
          WHERE to_tsvector('english', content)
                @@ plainto_tsquery('english', $1)
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [q, limit, offset]
      );
      res.json({ type: "posts", results: rows });
    }
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
