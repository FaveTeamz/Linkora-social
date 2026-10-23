import { NetworkError, ValidationError } from "./errors.js";
import { fetchWithTimeout } from "./utils/fetch.js";

export type AnalyticsPeriod = "1d" | "7d" | "30d" | "90d";

export interface CreatorMetrics {
  creatorAddress: string;
  period: AnalyticsPeriod;
  windowStart: string;
  windowEnd: string;
  totalTips: string;
  postCount: string;
  followerDelta: string;
  uniqueTippers: number;
}

export interface PlatformMetrics {
  period: AnalyticsPeriod;
  windowStart: string;
  windowEnd: string;
  totalTips: string;
  postCount: string;
  followerDelta: string;
  uniqueTippers: number;
  creatorCount: number;
}

interface AnalyticsClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Typed client for the analytics-oracle metrics API with a five-minute in-memory cache. */
export class AnalyticsClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(config: Partial<AnalyticsClientConfig> = {}) {
    this.baseUrl = (config.baseUrl ?? "http://localhost:4000").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async getCreatorMetrics(address: string, period: AnalyticsPeriod = "7d"): Promise<CreatorMetrics> {
    this.validateAddress(address);
    return this.getCached(
      `creator:${address}:${period}`,
      `/metrics/creators/${encodeURIComponent(address)}?period=${period}`
    );
  }

  async getPlatformMetrics(period: AnalyticsPeriod = "7d"): Promise<PlatformMetrics> {
    return this.getCached(`platform:${period}`, `/metrics/platform?period=${period}`);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async getCached<T>(key: string, path: string): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    this.cache.delete(key);

    const response = await fetchWithTimeout(
      `${this.baseUrl}${path}`,
      { headers: { Accept: "application/json" } },
      this.timeoutMs
    );
    if (!response.ok) {
      throw new NetworkError(`Analytics request failed with HTTP ${response.status}.`, {
        status: response.status,
        path,
      });
    }
    const value = (await response.json()) as T;
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  private validateAddress(address: string): void {
    if (!/^G[A-Z2-7]{55}$/.test(address)) {
      throw new ValidationError("creator address must be a valid Stellar public key.");
    }
  }
}

