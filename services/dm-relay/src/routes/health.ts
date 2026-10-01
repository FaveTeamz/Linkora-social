/**
 * Kubernetes-ready health endpoints: liveness, readiness, and startup probes.
 *
 * - /health          aggregate status, including degraded modes
 * - /health/live     always 200 while the process is running
 * - /health/ready    200 when the database and Redis (if configured) are
 *                    reachable and the relay isn't shutting down
 * - /health/startup  200 once initial bootstrap (DB init) has completed
 *
 * `rateLimiter` reports which store backs the HTTP and WebSocket limiters.
 * `shared: false` means limits are enforced per replica, so a scaled
 * deployment's effective limit is `limit × replicaCount`. That marks the
 * service degraded on /health but does not fail readiness — a single-replica
 * deployment is still correct, and pulling the pod from the load balancer
 * would turn a weak limit into an outage.
 */

import { Router } from "express";
import type { RateLimitStoreStatus } from "@linkora/types/src/rate-limit-env";
import { Database } from "../database";
import { getRateLimitStoreStatus } from "../middleware/rateLimit";

interface DependencyCheck {
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

export interface HealthState {
  db: Database;
  startTime: number;
  isStarted: () => boolean;
  startedAt: () => string | null;
  isShuttingDown: () => boolean;
  /** Redis URL for connection health check (optional — omitted when not configured). */
  redisUrl?: string;
  /** Service version — defaults to npm_package_version. */
  version?: string;
  /** Injectable for tests; defaults to the module-level limiter singleton. */
  rateLimitStatus?: () => RateLimitStoreStatus;
}

async function checkDatabase(db: Database): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    await db.ping();
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err: unknown) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Ping Redis by issuing a PING command via a short-lived ioredis connection.
 * We create a one-shot client rather than reusing the rate-limit client so
 * the health endpoint remains independent of the limiter's lifecycle.
 */
async function checkRedis(redisUrl: string): Promise<DependencyCheck> {
  const start = Date.now();
  let client: import("ioredis").Redis | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { default: Redis } = require("ioredis") as { default: typeof import("ioredis").Redis };
    client = new Redis(redisUrl, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    await client.connect();
    await client.ping();
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err: unknown) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (client) {
      try {
        await client.quit();
      } catch {
        // ignore disconnect errors on health-check clients
      }
    }
  }
}

export function createHealthRouter(state: HealthState): Router {
  const router = Router();
  const rateLimitStatus = state.rateLimitStatus ?? getRateLimitStoreStatus;
  const version = state.version ?? process.env.npm_package_version ?? "0.1.0";

  router.get("/health", async (_req, res) => {
    const uptime = Math.floor((Date.now() - state.startTime) / 1000);
    const rateLimiter = rateLimitStatus();

    if (state.isShuttingDown()) {
      res.status(503).json({
        status: "degraded",
        uptime,
        version,
        rateLimiter,
        checks: {
          database: { status: "down", latencyMs: 0 },
          ...(state.redisUrl ? { redis: { status: "down", latencyMs: 0 } } : {}),
        },
      });
      return;
    }

    const checks: {
      database: DependencyCheck;
      redis?: DependencyCheck;
    } = {
      database: await checkDatabase(state.db),
    };

    if (state.redisUrl) {
      checks.redis = await checkRedis(state.redisUrl);
    }

    const healthy =
      checks.database.status === "up" &&
      (!checks.redis || checks.redis.status === "up");

    const status = healthy ? (rateLimiter.shared ? "ok" : "degraded") : "degraded";

    res.status(healthy ? 200 : 503).json({
      status,
      uptime,
      version,
      rateLimiter,
      checks,
    });
  });

  router.get("/health/live", (_req, res) => {
    const uptime = Math.floor((Date.now() - state.startTime) / 1000);
    res.json({ status: "alive", uptime, version });
  });

  router.get("/health/ready", async (_req, res) => {
    const rateLimiter = rateLimitStatus();

    if (state.isShuttingDown()) {
      res.status(503).json({
        status: "not_ready",
        degraded: !rateLimiter.shared,
        checks: {
          database: { status: "down", latencyMs: 0 },
          ...(state.redisUrl ? { redis: { status: "down", latencyMs: 0 } } : {}),
          rateLimiter,
        },
      });
      return;
    }

    const checks: {
      database: DependencyCheck;
      redis?: DependencyCheck;
      rateLimiter: RateLimitStoreStatus;
    } = {
      database: await checkDatabase(state.db),
      rateLimiter,
    };

    if (state.redisUrl) {
      checks.redis = await checkRedis(state.redisUrl);
    }

    const ready =
      checks.database.status === "up" &&
      (!checks.redis || checks.redis.status === "up");

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      degraded: !rateLimiter.shared,
      checks,
    });
  });

  router.get("/health/startup", (_req, res) => {
    if (state.isStarted()) {
      res.json({ status: "started", startedAt: state.startedAt(), version });
    } else {
      res.status(503).json({ status: "starting" });
    }
  });

  return router;
}
