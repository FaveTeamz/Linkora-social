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

/**
 * Builds a safe PostgreSQL `to_tsquery` expression from a raw user query.
 * Strips tsquery operators and joins lexemes with `&` so the query is
 * always syntactically valid and cannot inject tsquery syntax.
 */
export function buildTsQuery(rawQuery: string): string {
  const lexemes = rawQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (lexemes.length === 0) {
    return '';
  }

  return lexemes.map((token) => `${token}:*`).join(' & ');
}

/**
 * Encodes an opaque pagination cursor from a rank and id pair.
 */
export function encodeCursor(rank: number, id: string): string {
  return Buffer.from(JSON.stringify({ rank, id }), 'utf8').toString('base64url');
}

/**
 * Decodes a pagination cursor. Returns null when the cursor is malformed.
 */
export function decodeCursor(
  cursor: string
): { rank: number; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      parsed &&
      typeof parsed.rank === 'number' &&
      Number.isFinite(parsed.rank) &&
      typeof parsed.id === 'string'
    ) {
      return { rank: parsed.rank, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}
