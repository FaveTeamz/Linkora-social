/**
 * Kubernetes-ready health endpoints: liveness, readiness, and startup probes.
 *
 * - /health          aggregate status, including degraded modes
 * - /health/live     always 200 while the process is running
 * - /health/ready    200 when downstream dependencies (DB, Stellar RPC, Redis)
 *                    are healthy
 * - /health/startup  200 once initial bootstrap (first analytics window) has
 *                    completed
 *
 * `rateLimiter` reports which store backs the limiter. `shared: false` means
 * limits are enforced per replica, so a scaled deployment's effective limit is
 * `limit × replicaCount`. That marks the service degraded on /health but does
 * not fail readiness — a single-replica deployment is still correct, and
 * pulling the pod from the load balancer would turn a weak limit into an
 * outage.
 */

import { Router } from "express";
import { Pool } from "pg";
import type { RateLimitStoreStatus } from "@linkora/types/src/rate-limit-env.js";
import { logger } from "../logger.js";
import { getRateLimitStoreStatus } from "../middleware/rate-limiter.js";

/** Slow-check warning threshold in ms — logs a warning but does not fail. */
const DB_SLOW_THRESHOLD_MS = 1_000;

/** Hard timeout for the database health check query in ms. */
const DB_HEALTH_TIMEOUT_MS = 5_000;

/** Hard timeout for the Redis PING in ms. */
const REDIS_HEALTH_TIMEOUT_MS = 3_000;

interface DependencyCheck {
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

export interface HealthDeps {
  db: Pool;
  rpcUrl: string;
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

async function checkDatabase(db: Pool): Promise<DependencyCheck> {
  const start = Date.now();
  let client;
  try {
    client = await db.connect();

    // Use pg statement_timeout to enforce a hard 5-second limit on the query.
    // This covers the case where the DB accepts the connection but hangs on
    // executing queries (i.e. not a refused connection, just unresponsive).
    await client.query(`SET statement_timeout = ${DB_HEALTH_TIMEOUT_MS}`);

    // Race the health-check query against an AbortController timer so the
    // health endpoint never blocks beyond DB_HEALTH_TIMEOUT_MS regardless of
    // whether the pg driver honours statement_timeout in all edge cases.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), DB_HEALTH_TIMEOUT_MS);

    try {
      await Promise.race([
        client.query("SELECT 1"),
        new Promise<never>((_resolve, reject) => {
          ac.signal.addEventListener("abort", () =>
            reject(new Error(`Database health check timed out after ${DB_HEALTH_TIMEOUT_MS}ms`))
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }

    const latencyMs = Date.now() - start;

    if (latencyMs > DB_SLOW_THRESHOLD_MS) {
      logger.warn({ latencyMs, threshold: DB_SLOW_THRESHOLD_MS }, "health: slow database check");
    }

    return { status: "up", latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("timed out") || message.includes("statement_timeout");

    logger.error(
      { latencyMs, error: message, timeout: isTimeout },
      "health: database check failed"
    );

    return { status: "down", latencyMs, error: isTimeout ? "timeout" : "error" };
  } finally {
    client?.release();
  }
}

async function checkStellarRpc(rpcUrl: string): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3000);
    await fetch(rpcUrl, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger", params: [] }),
    }).finally(() => clearTimeout(timeout));
    return { status: "up", latencyMs: Date.now() - start };
  } catch {
    return { status: "down", latencyMs: Date.now() - start };
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
    const { default: Redis } = await import("ioredis");
    client = new Redis(redisUrl, {
      connectTimeout: REDIS_HEALTH_TIMEOUT_MS,
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

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();
  const rateLimitStatus = deps.rateLimitStatus ?? getRateLimitStoreStatus;
  const version = deps.version ?? process.env["npm_package_version"] ?? "0.1.0";

  router.get("/health", async (_req, res) => {
    const uptime = Math.floor((Date.now() - deps.startTime) / 1000);
    const rateLimiter = rateLimitStatus();

    if (deps.isShuttingDown()) {
      res.status(503).json({
        status: "degraded",
        uptime,
        version,
        rateLimiter,
        checks: {
          database: { status: "down", latencyMs: 0 },
          stellar_rpc: { status: "down", latencyMs: 0 },
          ...(deps.redisUrl ? { redis: { status: "down", latencyMs: 0 } } : {}),
        },
      });
      return;
    }

    const [database, stellar_rpc, redis] = await Promise.all([
      checkDatabase(deps.db),
      checkStellarRpc(deps.rpcUrl),
      deps.redisUrl ? checkRedis(deps.redisUrl) : Promise.resolve(undefined),
    ]);

    const healthy =
      database.status === "up" &&
      stellar_rpc.status === "up" &&
      (!redis || redis.status === "up");

    const status = healthy ? (rateLimiter.shared ? "ok" : "degraded") : "degraded";

    res.status(healthy ? 200 : 503).json({
      status,
      uptime,
      version,
      rateLimiter,
      checks: {
        database,
        stellar_rpc,
        ...(redis ? { redis } : {}),
      },
    });
  });

  router.get("/health/live", (_req, res) => {
    const uptime = Math.floor((Date.now() - deps.startTime) / 1000);
    res.json({ status: "alive", uptime, version });
  });

  router.get("/health/ready", async (_req, res) => {
    const rateLimiter = rateLimitStatus();

    if (deps.isShuttingDown()) {
      res.status(503).json({
        status: "not_ready",
        degraded: !rateLimiter.shared,
        checks: {
          database: { status: "down", latencyMs: 0 },
          stellar_rpc: { status: "down", latencyMs: 0 },
          ...(deps.redisUrl ? { redis: { status: "down", latencyMs: 0 } } : {}),
          rateLimiter,
        },
      });
      return;
    }

    const [database, stellar_rpc, redis] = await Promise.all([
      checkDatabase(deps.db),
      checkStellarRpc(deps.rpcUrl),
      deps.redisUrl ? checkRedis(deps.redisUrl) : Promise.resolve(undefined),
    ]);

    const ready =
      database.status === "up" &&
      stellar_rpc.status === "up" &&
      (!redis || redis.status === "up");

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      degraded: !rateLimiter.shared,
      checks: {
        database,
        stellar_rpc,
        ...(redis ? { redis } : {}),
        rateLimiter,
      },
    });
  });

  router.get("/health/startup", (_req, res) => {
    if (deps.isStarted()) {
      res.json({ status: "started", startedAt: deps.startedAt(), version });
    } else {
      res.status(503).json({ status: "starting" });
    }
  });

  return router;
}
