"use client";

import { useCallback, useEffect, useState } from "react";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";

export interface ReputationData {
  user_address: string;
  score: number;
  posts_count: number;
  tips_sent: number;
  tips_received: number;
  governance_votes: number;
  last_computed_at: string;
  updated_ledger: number;
}

interface UseReputationResult {
  reputation: ReputationData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function isReputationData(value: unknown): value is ReputationData {
  if (!value || typeof value !== "object") return false;
  const score = value as Partial<ReputationData>;
  const numericFields = [
    score.score,
    score.posts_count,
    score.tips_sent,
    score.tips_received,
    score.governance_votes,
    score.updated_ledger,
  ];
  return (
    typeof score.user_address === "string" &&
    numericFields.every((field) => typeof field === "number" && Number.isFinite(field)) &&
    typeof score.last_computed_at === "string"
  );
}

export function useReputation(address: string | null): UseReputationResult {
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(address));
  const [error, setError] = useState<string | null>(null);

  const fetchReputation = useCallback(
    async (signal?: AbortSignal) => {
      if (!address) {
        setReputation(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `${INDEXER_URL}/api/profiles/${encodeURIComponent(address)}/reputation`,
          { signal }
        );
        if (!response.ok) {
          throw new Error(`Unable to load reputation (${response.status})`);
        }
        const payload: unknown = await response.json();
        if (!isReputationData(payload)) {
          throw new Error("The reputation response has an invalid format");
        }
        setReputation(payload);
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setReputation(null);
        setError(cause instanceof Error ? cause.message : "Unable to load reputation");
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [address]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchReputation(controller.signal);
    return () => controller.abort();
  }, [fetchReputation]);

  return { reputation, isLoading, error, refetch: () => fetchReputation() };
}
