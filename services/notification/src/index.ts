// tracing MUST be the very first import so OTel auto-instrumentations are
// registered before express (or any other library) is loaded.
import "./tracing";

import express, { type Application, Request, Response } from "express";
import { trace } from "@opentelemetry/api";
import { pino } from "pino";
import { notificationQueue } from "./dispatcher";

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service: "notification" },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env["NODE_ENV"] !== "production" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, ignore: "pid,hostname", translateTime: "SYS:standard" },
    },
  }),
});

const app: Application = express();
app.use(express.json());

app.get("/metrics", (_req: Request, res: Response) => {
  res.type("text/plain; version=0.0.4").send(notificationQueue.metricsText());
});

const tracer = trace.getTracer("notification");

/** GET /health — liveness probe with a sample manual span */
app.get("/health", (_req: Request, res: Response) => {
  const span = tracer.startSpan("notification.health.check");
  try {
    res.json({ status: "ok", service: "notification" });
  } finally {
    span.end();
  }
});

/** GET /health/ready — readiness probe */
app.get("/health/ready", (_req: Request, res: Response) => {
  res.json({ status: "ready", service: "notification" });
});

const PORT = parseInt(process.env["PORT"] ?? "3002", 10);

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "notification service listening");
});

// Graceful shutdown
function shutdown() {
  logger.info("shutting down notification service");
  server.close(() => {
    void notificationQueue
      .stopAndDrain()
      .then(() => process.exit(0))
      .catch((error) => {
        logger.error({ err: error }, "failed to drain notification queue");
        process.exit(1);
      });
  });
  setTimeout(() => process.exit(1), 30_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app };
