import pino from "pino";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

// ── Environment ───────────────────────────────────────────────────────────────

const isDev =
  process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

// ── Sensitive-field redaction ─────────────────────────────────────────────────
//
// These paths are removed from every log entry before it is serialised.
// Add any new sensitive fields here rather than at the call site.
//
// Format: "key"  — top-level field
//         "obj.key" — nested field
//
// pino redact replaces the value with "[Redacted]".

const REDACTED_PATHS: string[] = [
  // Auth / bearer tokens
  "authorization",
  "req.headers.authorization",
  "*.authorization",
  // Stellar secret keys (sXxx…)
  "secretKey",
  "secret_key",
  "adminSecret",
  "admin_secret",
  // Wallet / account addresses — redact only dedicated address fields
  // (not message text, which may reference public identifiers).
  "walletAddress",
  "wallet_address",
  // Generic credential-shaped fields
  "password",
  "token",
  "apiKey",
  "api_key",
];

// ── Pino transport (dev only) ─────────────────────────────────────────────────

function resolveTransport(): pino.TransportSingleOptions | undefined {
  if (!isDev) return undefined;
  try {
    require.resolve("pino-pretty");
    return {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "SYS:standard",
      },
    };
  } catch {
    // pino-pretty not installed — fall back to JSON
    return undefined;
  }
}

const transport = resolveTransport();

// ── Logger ────────────────────────────────────────────────────────────────────
//
// Every log entry emitted by the search service will include:
//   - time        (ISO-8601 timestamp)
//   - level       (trace/debug/info/warn/error/fatal)
//   - service     "search"
//   - msg         (log message)
//
// Per-request entries additionally include:
//   - request_id  (UUID v4, propagated via X-Request-Id header or generated)

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "search" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACTED_PATHS,
    censor: "[Redacted]",
  },
  ...(transport && { transport }),
});

// ── Request-ID middleware ─────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Attach a request ID to every inbound HTTP request and emit structured
 * access logs at INFO level.  The ID is taken from the X-Request-Id header
 * when present (e.g. from an upstream gateway) or generated fresh.
 */
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId =
    (req.headers["x-request-id"] as string | undefined) ?? randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startTime = Date.now();

  logger.info(
    {
      request_id: requestId,
      method: req.method,
      path: req.path,
    },
    "Incoming request"
  );

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const logData = {
      request_id: requestId,
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: duration,
    };

    if (res.statusCode >= 500) {
      logger.error(logData, "Request completed with server error");
    } else if (duration > 500) {
      logger.warn(logData, "Slow request");
    } else {
      logger.info(logData, "Request completed");
    }
  });

  next();
}

/**
 * Return a child logger bound to a specific request ID.
 * Use this inside route handlers to correlate all logs for a single request.
 *
 * @example
 * const reqLogger = childLogger(req.requestId);
 * reqLogger.info({ query, hits }, "Search completed");
 */
export function childLogger(requestId: string): pino.Logger {
  return logger.child({ request_id: requestId });
}

export default logger;
