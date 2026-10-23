import { NetworkError, ValidationError } from "./errors.js";
import { fetchWithTimeout } from "./utils/fetch.js";

export interface ReputationData {
  address: string;
  score: number;
  postsCount: number;
  tipsSent: number;
  tipsReceived: number;
  governanceVotes: number;
  lastComputedAt: string;
  updatedLedger: number;
}

export interface ReputationClientConfig {
  indexerUrl?: string;
  timeoutMs?: number;
}

/** Reads reputation snapshots from the indexer until the on-chain view is available. */
export class ReputationClient {
  private readonly indexerUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ReputationClientConfig = {}) {
    this.indexerUrl = (config.indexerUrl ?? "http://localhost:3001").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async getScore(address: string): Promise<ReputationData> {
    this.validateAddress(address);
    return this.get<ReputationData>(`/api/reputation/${encodeURIComponent(address)}`);
  }

  async getLeaderboard(limit = 20, offset = 0): Promise<ReputationData[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError("leaderboard limit must be an integer between 1 and 100.");
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new ValidationError("leaderboard offset must be a non-negative integer.");
    }
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const result = await this.get<{ entries: ReputationData[] }>(
      `/api/reputation/leaderboard?${params.toString()}`
    );
    return result.entries;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetchWithTimeout(
      `${this.indexerUrl}${path}`,
      { headers: { Accept: "application/json" } },
      this.timeoutMs
    );
    if (!response.ok) {
      throw new NetworkError(`Reputation request failed with HTTP ${response.status}.`, {
        status: response.status,
        path,
      });
    }
    return (await response.json()) as T;
  }

  private validateAddress(address: string): void {
    if (!/^G[A-Z2-7]{55}$/.test(address)) {
      throw new ValidationError("address must be a valid Stellar public key.");
    }
  }
}
