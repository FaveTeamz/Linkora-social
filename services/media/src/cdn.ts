import { createHmac } from "node:crypto";

export interface CdnUrlOptions {
  baseUrl?: string;
  signingSecret?: string;
  expiresInSeconds?: number;
  now?: number;
}

/** Create a public CDN URL or an HMAC-signed, expiring private URL. */
export function createCdnUrl(key: string, isPublic: boolean, options: CdnUrlOptions = {}): string {
  if (typeof key !== "string" || !key.trim()) throw new TypeError("Object key is required");
  const baseUrl = (options.baseUrl ?? process.env.CDN_BASE_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("CDN_BASE_URL must be configured");

  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    throw new TypeError("Object key contains an invalid path segment");
  }
  const safeKey = segments.map(encodeURIComponent).join("/");
  const url = new URL(`${baseUrl}/${safeKey}`);
  if (isPublic) return url.toString();

  const secret = options.signingSecret ?? process.env.CDN_SIGNING_SECRET;
  if (!secret) throw new Error("CDN_SIGNING_SECRET must be configured for private objects");
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("CDN_SIGNING_SECRET must be at least 32 bytes");
  const ttl = options.expiresInSeconds ?? 15 * 60;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 7 * 24 * 60 * 60) {
    throw new RangeError("expiresInSeconds must be between 1 second and 7 days");
  }
  const expires = Math.floor((options.now ?? Date.now()) / 1000) + ttl;
  const signature = createHmac("sha256", secret).update(`${url.pathname}\n${expires}`).digest("hex");
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);
  return url.toString();
}
