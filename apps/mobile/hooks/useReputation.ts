import { useCallback, useMemo, useState } from 'react';

export type ReputationTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface ReputationSignal {
  id: string;
  label: string;
  weight: number;
  value: number;
}

export interface ReputationBreakdown {
  score: number;
  tier: ReputationTier;
  percentile: number;
  topSignals: ReputationSignal[];
}

export interface UseReputationResult {
  breakdown: ReputationBreakdown;
  isSheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  toggleSheet: () => void;
}

const TIER_THRESHOLDS: Array<{ tier: ReputationTier; min: number }> = [
  { tier: 'diamond', min: 900 },
  { tier: 'platinum', min: 750 },
  { tier: 'gold', min: 600 },
  { tier: 'silver', min: 400 },
  { tier: 'bronze', min: 0 },
];

export function getTierForScore(score: number): ReputationTier {
  const match = TIER_THRESHOLDS.find((entry) => score >= entry.min);
  return match ? match.tier : 'bronze';
}

const DEFAULT_SIGNALS: ReputationSignal[] = [
  { id: 'contributions', label: 'Contributions', weight: 0.4, value: 0 },
  { id: 'reviews', label: 'Peer reviews', weight: 0.3, value: 0 },
  { id: 'consistency', label: 'Consistency', weight: 0.2, value: 0 },
  { id: 'community', label: 'Community', weight: 0.1, value: 0 },
];

function buildBreakdown(
  score: number,
  percentile: number,
  signals: ReputationSignal[],
): ReputationBreakdown {
  const topSignals = [...signals]
    .sort((a, b) => b.weight * b.value - a.weight * a.value)
    .slice(0, 3);

  return {
    score,
    tier: getTierForScore(score),
    percentile,
    topSignals,
  };
}

export function useReputation(
  initialScore = 0,
  initialPercentile = 0,
  initialSignals: ReputationSignal[] = DEFAULT_SIGNALS,
): UseReputationResult {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const breakdown = useMemo(
    () => buildBreakdown(initialScore, initialPercentile, initialSignals),
    [initialScore, initialPercentile, initialSignals],
  );

  const openSheet = useCallback(() => setIsSheetOpen(true), []);
  const closeSheet = useCallback(() => setIsSheetOpen(false), []);
  const toggleSheet = useCallback(() => setIsSheetOpen((prev) => !prev), []);

  return { breakdown, isSheetOpen, openSheet, closeSheet, toggleSheet };
}
