import { NetworkError, ValidationError } from "./errors.js";
import { fetchWithTimeout } from "./utils/fetch.js";

const CACHE_TTL_MS = 60_000;

export interface ProfileClientConfig {
  indexerUrl?: string;
  timeoutMs?: number;
}

/** Resolves exact usernames through the indexer with a one-minute local cache. */
export class ProfileClient {
  private readonly indexerUrl: string;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, { address: string | null; expiresAt: number }>();

  constructor(config: ProfileClientConfig = {}) {
    this.indexerUrl = (config.indexerUrl ?? "http://localhost:3001").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async resolveUsername(username: string): Promise<string | null> {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || normalizedUsername.length > 64) {
      throw new ValidationError("username must contain between 1 and 64 characters.");
    }
    const key = normalizedUsername.toLocaleLowerCase("en-US");
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.address;
    this.cache.delete(key);

    const params = new URLSearchParams({ username: normalizedUsername });
    const path = `/api/profiles/search?${params.toString()}`;
    const response = await fetchWithTimeout(
      `${this.indexerUrl}${path}`,
      { headers: { Accept: "application/json" } },
      this.timeoutMs
    );
    if (!response.ok) {
      throw new NetworkError(`Profile lookup failed with HTTP ${response.status}.`, {
        status: response.status,
        path,
      });
    }
    const result = (await response.json()) as { address?: string | null };
    const address = result.address ?? null;
    this.cache.set(key, { address, expiresAt: Date.now() + CACHE_TTL_MS });
    return address;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
