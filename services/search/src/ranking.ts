export interface PostSearchResult {
  id: string;
  author: string;
  content: string;
  createdAt: string | Date;
  likesCount: number;
  tipsTotal: number;
  tsRank: number;
}

export interface ProfileSearchResult {
  address: string;
  username: string;
  bio: string;
  reputationScore: number;
  tsRank: number;
}

/**
 * Calculates a composite ranking score for a post search result.
 * Combines PostgreSQL FTS ts_rank, a recency boost (<24h), and an engagement score.
 */
export function calculatePostRank(
  post: PostSearchResult,
  now: Date = new Date()
): number {
  const baseScore = Math.max(0, post.tsRank);

  // Recency boost: +20% if created within the past 24 hours
  const postDate = new Date(post.createdAt);
  const ageMs = now.getTime() - postDate.getTime();
  const isRecent = ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
  const recencyMultiplier = isRecent ? 1.2 : 1.0;

  // Engagement score: log-scaled like count and tip amount
  const likeBoost = Math.log10(1 + Math.max(0, post.likesCount)) * 0.1;
  const tipBoost = Math.log10(1 + Math.max(0, post.tipsTotal)) * 0.15;
  const engagementBoost = 1.0 + likeBoost + tipBoost;

  const finalScore = baseScore * recencyMultiplier * engagementBoost;
  // Round to 6 decimal places for deterministic output
  return Number(finalScore.toFixed(6));
}

/**
 * Calculates a composite ranking score for a profile search result.
 * Strongly boosts exact username matches.
 */
export function calculateProfileRank(
  profile: ProfileSearchResult,
  searchQuery: string
): number {
  const baseScore = Math.max(0, profile.tsRank);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const normalizedUsername = profile.username.trim().toLowerCase();

  // Exact username match boost: 2.5x multiplier
  const isExactMatch = normalizedUsername === normalizedQuery;
  const matchMultiplier = isExactMatch ? 2.5 : 1.0;

  // Reputation factor
  const repBoost = Math.log10(1 + Math.max(0, profile.reputationScore)) * 0.05;

  const finalScore = (baseScore + 0.1) * matchMultiplier * (1.0 + repBoost);
  return Number(finalScore.toFixed(6));
}
