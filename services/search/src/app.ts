import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { logger } from "./logger";
import { getPool } from "./db";
import { searchAll, searchProfiles, searchPosts } from "./search";

// ---------------------------------------------------------------------------
// Input validation schemas
// ---------------------------------------------------------------------------

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Middleware helpers
// ---------------------------------------------------------------------------

function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: "Invalid query parameters", details: result.error.flatten() });
      return;
    }
    (req as Request & { validatedQuery: unknown }).validatedQuery = result.data;
    next();
  };
}

// ---------------------------------------------------------------------------
// App factory — exported so tests can instantiate without binding a port
// ---------------------------------------------------------------------------

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json());

  // Basic rate limiting: 60 requests / minute per IP
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  /** GET /health */
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "search" });
  });

  /**
   * GET /search?q=<query>[&limit=<n>]
   *
   * Returns combined profile + post results ranked by relevance.
   */
  app.get("/search", validateQuery(searchQuerySchema), async (req: Request, res: Response) => {
    const { q, limit } = (req as Request & { validatedQuery: z.infer<typeof searchQuerySchema> })
      .validatedQuery;
    try {
      const results = await searchAll(getPool(), q, limit);
      res.json({ results });
    } catch (err) {
      logger.error({ err, q }, "search/all error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /search/profiles?q=<query>[&limit=<n>]
   *
   * Full-text search across profiles only (username + bio).
   */
  app.get(
    "/search/profiles",
    validateQuery(searchQuerySchema),
    async (req: Request, res: Response) => {
      const { q, limit } = (req as Request & { validatedQuery: z.infer<typeof searchQuerySchema> })
        .validatedQuery;
      try {
        const results = await searchProfiles(getPool(), q, limit);
        res.json({ results });
      } catch (err) {
        logger.error({ err, q }, "search/profiles error");
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  /**
   * GET /search/posts?q=<query>[&limit=<n>]
   *
   * Full-text search across posts only (content).
   */
  app.get(
    "/search/posts",
    validateQuery(searchQuerySchema),
    async (req: Request, res: Response) => {
      const { q, limit } = (req as Request & { validatedQuery: z.infer<typeof searchQuerySchema> })
        .validatedQuery;
      try {
        const results = await searchPosts(getPool(), q, limit);
        res.json({ results });
      } catch (err) {
        logger.error({ err, q }, "search/posts error");
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  return app;
}
