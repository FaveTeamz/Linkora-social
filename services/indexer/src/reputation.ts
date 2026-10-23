import { calculateReputationScore } from "@linkora/reputation";
import { PgClientLike } from "./pipeline";

interface ReputationCounts {
  posts_count: string | number;
  tips_sent: string | number;
  tips_received: string | number;
  governance_votes: string | number;
  likes_received: string | number;
  followers: string | number;
  follows_made: string | number;
}

function numericCount(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function refreshReputationScore(
  client: PgClientLike,
  userAddress: string,
  ledger: number
): Promise<void> {
  if (!userAddress) return;

  const result = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM posts WHERE author = $1 AND deleted_at IS NULL) AS posts_count,
       (SELECT COUNT(*) FROM tips WHERE tipper = $1) AS tips_sent,
       (SELECT COUNT(*) FROM tips t JOIN posts p ON p.id = t.post_id WHERE p.author = $1) AS tips_received,
       (SELECT COUNT(*) FROM governance_votes WHERE voter = $1) AS governance_votes,
       (SELECT COUNT(*) FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.author = $1) AS likes_received,
       (SELECT COUNT(*) FROM follows WHERE followee = $1) AS followers,
       (SELECT COUNT(*) FROM follows WHERE follower = $1) AS follows_made`,
    [userAddress]
  );
  const counts = result.rows[0] as ReputationCounts | undefined;
  if (!counts) return;

  const postsCount = numericCount(counts.posts_count);
  const tipsSent = numericCount(counts.tips_sent);
  const tipsReceived = numericCount(counts.tips_received);
  const governanceVotes = numericCount(counts.governance_votes);
  const score = calculateReputationScore({
    postsCount,
    tipsSent,
    tipsReceived,
    governanceVotes,
    likesReceived: numericCount(counts.likes_received),
    followers: numericCount(counts.followers),
    followsMade: numericCount(counts.follows_made),
  });

  await client.query(
    `INSERT INTO reputation_scores
       (user_address, score, posts_count, tips_sent, tips_received, governance_votes, last_computed_at, updated_ledger)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
     ON CONFLICT (user_address) DO UPDATE SET
       score = EXCLUDED.score,
       posts_count = EXCLUDED.posts_count,
       tips_sent = EXCLUDED.tips_sent,
       tips_received = EXCLUDED.tips_received,
       governance_votes = EXCLUDED.governance_votes,
       last_computed_at = EXCLUDED.last_computed_at,
       updated_ledger = GREATEST(reputation_scores.updated_ledger, EXCLUDED.updated_ledger)`,
    [userAddress, score, postsCount, tipsSent, tipsReceived, governanceVotes, ledger]
  );
}

export async function refreshReputationScores(
  client: PgClientLike,
  userAddresses: string[],
  ledger: number
): Promise<void> {
  for (const address of new Set(userAddresses.filter(Boolean))) {
    await refreshReputationScore(client, address, ledger);
  }
}