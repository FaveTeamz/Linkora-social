import { randomBytes, createHmac } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { request as httpsRequest } from "https";
import { Router, Request, Response } from "express";
import { Pool } from "pg";
import { z } from "zod";
import { BusEvent } from "./bus";
import type { PgClientLike } from "./pipeline";
import { rateLimitWrite } from "./middleware/rateLimit";
import { requireStellarAuth } from "./middleware/stellarAuth";
import { validateBody } from "./middleware/validate";
import { logger } from "./logger";

const DELIVERY_BATCH_SIZE = 20;
const DELIVERY_INTERVAL_MS = 1_000;
const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_DELIVERY_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1_000;

interface ClaimedDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: BusEvent;
  attempts: number;
  url: string;
  secret: string;
}

interface WebhookRecord {
  id: string;
  url: string;
  event_types: string[];
  created_at: Date;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [first, second] = address.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      return isPrivateAddress(normalized.slice("::ffff:".length));
    }
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff")
    );
  }

  return true;
}

async function resolvePublicHttpsUrl(rawUrl: string): Promise<{ url: URL; address: string }> {
  const url = new URL(rawUrl);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    !url.hostname ||
    url.hostname.toLowerCase().endsWith(".localhost") ||
    url.hostname.toLowerCase() === "localhost"
  ) {
    throw new Error("Webhook URL must be a public HTTPS URL without credentials");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Webhook URL must resolve only to public IP addresses");
  }

  return { url, address: addresses[0].address };
}

function postSignedWebhook(
  url: URL,
  address: string,
  deliveryId: string,
  eventType: string,
  secret: string,
  body: string
): Promise<number> {
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        servername: url.hostname.replace(/^\[|\]$/g, ""),
        lookup: (_hostname, _options, callback) => callback(null, address, isIP(address)),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Linkora-Event": eventType,
          "X-Linkora-Delivery": deliveryId,
          "X-Linkora-Timestamp": timestamp,
          "X-Linkora-Signature": `sha256=${signature}`,
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          if (status >= 200 && status < 300) resolve(status);
          else reject(new Error(`Webhook responded with HTTP ${status}`));
        });
      }
    );

    request.setTimeout(DELIVERY_TIMEOUT_MS, () => request.destroy(new Error("Webhook request timed out")));
    request.once("error", reject);
    request.end(body);
  });
}

const registerWebhookSchema = z.object({
  url: z.string().url().max(2_048),
  eventTypes: z.array(z.string().min(1).max(100)).min(1).max(100).default(["*"]),
});

export class WebhookDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<void> | null = null;
  private stopped = true;

  constructor(private readonly pool: Pool) {}

  async register(ownerAddress: string, rawUrl: string, eventTypes: string[]): Promise<{
    id: string;
    url: string;
    eventTypes: string[];
    secret: string;
    createdAt: Date;
  }> {
    await resolvePublicHttpsUrl(rawUrl);
    const secret = randomBytes(32).toString("hex");
    const { rows } = await this.pool.query<WebhookRecord>(
      `INSERT INTO webhook_subscriptions (owner_address, url, secret, event_types)
       VALUES ($1, $2, $3, $4)
       RETURNING id, url, event_types, created_at`,
      [ownerAddress, rawUrl, secret, eventTypes]
    );
    const record = rows[0];
    return {
      id: record.id,
      url: record.url,
      eventTypes: record.event_types,
      secret,
      createdAt: record.created_at,
    };
  }

  async list(ownerAddress: string): Promise<Array<Omit<WebhookRecord, "event_types"> & { eventTypes: string[] }>> {
    const { rows } = await this.pool.query<WebhookRecord>(
      `SELECT id, url, event_types, created_at
         FROM webhook_subscriptions
        WHERE owner_address = $1
        ORDER BY created_at DESC`,
      [ownerAddress]
    );
    return rows.map(({ id, url, event_types, created_at }) => ({
      id,
      url,
      eventTypes: event_types,
      created_at,
    }));
  }

  async remove(ownerAddress: string, id: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query<{ id: string }>(
        `SELECT id FROM webhook_subscriptions WHERE id = $1 AND owner_address = $2 FOR UPDATE`,
        [id, ownerAddress]
      );
      if (owned.rowCount === 0) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        `UPDATE webhook_deliveries
            SET status = 'failed', last_error = 'Webhook subscription removed', updated_at = NOW()
          WHERE webhook_id = $1 AND status = 'pending'`,
        [id]
      );
      await client.query("DELETE FROM webhook_subscriptions WHERE id = $1", [id]);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async deliveries(ownerAddress: string, id: string, limit: number): Promise<unknown[] | null> {
    const { rows } = await this.pool.query(
      `SELECT d.id, d.event_type, d.status, d.attempts, d.response_status,
              d.last_error, d.created_at, d.last_attempt_at, d.completed_at
         FROM webhook_deliveries d
         JOIN webhook_subscriptions s ON s.id = d.webhook_id
        WHERE s.owner_address = $1 AND s.id = $2
        ORDER BY d.created_at DESC
        LIMIT $3`,
      [ownerAddress, id, limit]
    );
    const owned = await this.pool.query(
      `SELECT 1 FROM webhook_subscriptions WHERE owner_address = $1 AND id = $2`,
      [ownerAddress, id]
    );
    return owned.rowCount === 0 ? null : rows;
  }

  async enqueue(client: PgClientLike, event: BusEvent): Promise<void> {
    const eventId = `${event.contractId}:${event.ledgerSequence}:${event.eventIndex}`;
    await client.query(
      `INSERT INTO webhook_deliveries (webhook_id, event_id, event_type, payload)
       SELECT id, $1, $2, $3::jsonb
         FROM webhook_subscriptions
        WHERE event_types @> ARRAY['*']::text[] OR event_types @> ARRAY[$2]::text[]
       ON CONFLICT (webhook_id, event_id) DO NOTHING`,
      [eventId, event.type, JSON.stringify(event)]
    );
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.timer = setInterval(() => void this.runOnce(), DELIVERY_INTERVAL_MS);
    this.timer.unref();
    void this.runOnce();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.activeRun;
  }

  private runOnce(): Promise<void> {
    if (this.stopped || this.activeRun) return this.activeRun ?? Promise.resolve();
    this.activeRun = this.deliverBatch()
      .catch((error) => logger.error({ err: error }, "Webhook delivery batch failed"))
      .finally(() => {
        this.activeRun = null;
      });
    return this.activeRun;
  }

  private async deliverBatch(): Promise<void> {
    await this.pool.query(
      `DELETE FROM webhook_deliveries WHERE created_at < NOW() - INTERVAL '7 days'`
    );
    await this.pool.query(
      `UPDATE webhook_deliveries
          SET status = 'pending', next_attempt_at = NOW(), updated_at = NOW()
        WHERE status = 'delivering' AND last_attempt_at < NOW() - INTERVAL '1 minute'`
    );

    const { rows } = await this.pool.query<ClaimedDelivery>(
      `WITH due AS (
         SELECT d.id, s.url, s.secret
           FROM webhook_deliveries d
           JOIN webhook_subscriptions s ON s.id = d.webhook_id
          WHERE d.status = 'pending' AND d.next_attempt_at <= NOW()
          ORDER BY d.next_attempt_at, d.id
          LIMIT $1
          FOR UPDATE OF d SKIP LOCKED
       )
       UPDATE webhook_deliveries d
          SET status = 'delivering', attempts = d.attempts + 1,
              last_attempt_at = NOW(), updated_at = NOW()
         FROM due
        WHERE d.id = due.id
       RETURNING d.id, d.webhook_id, d.event_type, d.payload, d.attempts, due.url, due.secret`,
      [DELIVERY_BATCH_SIZE]
    );

    await Promise.all(rows.map((delivery) => this.deliver(delivery)));
  }

  private async deliver(delivery: ClaimedDelivery): Promise<void> {
    try {
      const { url, address } = await resolvePublicHttpsUrl(delivery.url);
      const body = JSON.stringify(delivery.payload);
      const status = await postSignedWebhook(
        url,
        address,
        delivery.id,
        delivery.event_type,
        delivery.secret,
        body
      );
      await this.pool.query(
        `UPDATE webhook_deliveries
            SET status = 'succeeded', response_status = $2, last_error = NULL,
                completed_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [delivery.id, status]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2_000) : "Unknown delivery error";
      const retryDelayMs = Math.min(1_000 * 2 ** (delivery.attempts - 1), MAX_RETRY_DELAY_MS);
      const nextStatus = delivery.attempts >= MAX_DELIVERY_ATTEMPTS ? "failed" : "pending";
      await this.pool.query(
        `UPDATE webhook_deliveries
            SET status = $2, last_error = $3, updated_at = NOW(),
                completed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END,
                next_attempt_at = NOW() + ($4 * INTERVAL '1 millisecond')
          WHERE id = $1`,
        [delivery.id, nextStatus, message, retryDelayMs]
      );
      logger.warn(
        { deliveryId: delivery.id, webhookId: delivery.webhook_id, attempts: delivery.attempts, err: message },
        "Webhook delivery failed"
      );
    }
  }
}

export function createWebhooksRouter(dispatcher: WebhookDispatcher): Router {
  const router = Router();

  router.post(
    "/register",
    requireStellarAuth,
    rateLimitWrite,
    validateBody(registerWebhookSchema),
    async (req: Request, res: Response): Promise<void> => {
      const ownerAddress = req.context?.stellarAddress;
      if (!ownerAddress) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { url, eventTypes } = req.body as z.infer<typeof registerWebhookSchema>;
      try {
        const webhook = await dispatcher.register(ownerAddress, url, eventTypes);
        res.status(201).json(webhook);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to register webhook";
        const status = message.startsWith("Webhook URL") ? 400 : 500;
        res.status(status).json({ error: message });
      }
    }
  );

  router.get(
    "/",
    requireStellarAuth,
    async (req: Request, res: Response): Promise<void> => {
      const ownerAddress = req.context?.stellarAddress;
      if (!ownerAddress) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      res.json(await dispatcher.list(ownerAddress));
    }
  );

  router.delete(
    "/:id",
    requireStellarAuth,
    rateLimitWrite,
    async (req: Request, res: Response): Promise<void> => {
      const ownerAddress = req.context?.stellarAddress;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!ownerAddress) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ error: "Invalid webhook id" });
        return;
      }
      const removed = await dispatcher.remove(ownerAddress, id);
      res.sendStatus(removed ? 204 : 404);
    }
  );

  router.get(
    "/:id/deliveries",
    requireStellarAuth,
    async (req: Request, res: Response): Promise<void> => {
      const ownerAddress = req.context?.stellarAddress;
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!ownerAddress) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ error: "Invalid webhook id" });
        return;
      }
      const parsedLimit = Number(req.query.limit);
      const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
      const deliveries = await dispatcher.deliveries(ownerAddress, id, limit);
      if (deliveries === null) {
        res.sendStatus(404);
        return;
      }
      res.json({ deliveries });
    }
  );

  return router;
}