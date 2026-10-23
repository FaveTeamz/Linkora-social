import { Pool } from "pg";

export interface CreatorStats {
  creatorAddress: string;
  totalTips: bigint;
  postCount: bigint;
  followerDelta: bigint;
  uniqueTippers: number;
}

export interface PlatformStats {
  totalTips: bigint;
  postCount: bigint;
  followerDelta: bigint;
  uniqueTippers: number;
  creatorCount: number;
}

export interface CreatorMetrics {
  creatorAddress: string;
  totalTips: bigint;
  postCount: bigint;
  followerDelta: bigint;
  uniqueTippers: number;
}

export class CreatorStatsValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(message);
    this.name = "CreatorStatsValidationError";
  }
}

function isNonNegativeBigint(v: bigint): boolean {
  return v >= 0n;
}

function validateCreatorStats(stats: CreatorStats): void {
  if (typeof stats.creatorAddress !== "string" || stats.creatorAddress.length === 0) {
    throw new CreatorStatsValidationError(
      `creatorAddress must be a non-empty string, got ${typeof stats.creatorAddress}`,
      "creatorAddress",
      stats.creatorAddress
    );
  }

  if (!isNonNegativeBigint(stats.totalTips)) {
    throw new CreatorStatsValidationError(
      `totalTips must be non-negative, got ${stats.totalTips}`,
      "totalTips",
      stats.totalTips
    );
  }

  if (!isNonNegativeBigint(stats.postCount)) {
    throw new CreatorStatsValidationError(
      `postCount must be non-negative, got ${stats.postCount}`,
      "postCount",
      stats.postCount
    );
  }

  if (!isNonNegativeBigint(stats.followerDelta)) {
    throw new CreatorStatsValidationError(
      `followerDelta must be non-negative, got ${stats.followerDelta}`,
      "followerDelta",
      stats.followerDelta
    );
  }

  if (!Number.isInteger(stats.uniqueTippers) || stats.uniqueTippers < 0) {
    throw new CreatorStatsValidationError(
      `uniqueTippers must be a non-negative integer, got ${stats.uniqueTippers}`,
      "uniqueTippers",
      stats.uniqueTippers
    );
  }
}

/**
 * Queries the indexer database for per-creator analytics in the given ledger window.
 */
export async function fetchCreatorStats(
  db: Pool,
  windowStart: bigint,
  windowEnd: bigint
): Promise<CreatorStats[]> {
  // Aggregate tips, posts, and follower changes for each creator active in the window.
  const result = await db.query<{
    creator: string;
    total_tips: string;
    post_count: string;
    follower_delta: string;
    unique_tippers: string;
  }>(
    `
    SELECT
      p.author                              AS creator,
      COALESCE(SUM(t.amount), 0)            AS total_tips,
      COUNT(DISTINCT p.id)                  AS post_count,
      COALESCE(
        (SELECT COUNT(*) FROM follows f WHERE f.followee = p.author
          AND f.ledger_sequence BETWEEN $1 AND $2) -
        (SELECT COUNT(*) FROM unfollows uf WHERE uf.followee = p.author
          AND uf.ledger_sequence BETWEEN $1 AND $2),
        0
      )                                     AS follower_delta,
      COUNT(DISTINCT t.tipper)              AS unique_tippers
    FROM posts p
    LEFT JOIN tips t
      ON t.post_id = p.id AND t.ledger_sequence BETWEEN $1 AND $2
    WHERE p.ledger_sequence BETWEEN $1 AND $2
    GROUP BY p.author
    `,
    [windowStart.toString(), windowEnd.toString()]
  );

  return result.rows.map((row) => {
    const stats: CreatorStats = {
      creatorAddress: row.creator,
      totalTips: BigInt(row.total_tips),
      postCount: BigInt(row.post_count),
      followerDelta: BigInt(row.follower_delta),
      uniqueTippers: parseInt(row.unique_tippers, 10),
    };
    validateCreatorStats(stats);
    return stats;
  });
}

/** Aggregate platform-wide totals for an inclusive time window. */
export async function fetchPlatformStats(
  db: Pool,
  windowStart: Date
): Promise<PlatformStats> {
  const windowStartEpoch = Math.floor(windowStart.getTime() / 1000);
  const result = await db.query<{
    total_tips: string;
    post_count: string;
    follower_delta: string;
    unique_tippers: string;
    creator_count: string;
  }>(
    `
    SELECT
      (SELECT COALESCE(SUM(amount), 0)::text FROM tips
        WHERE created_at >= $1) AS total_tips,
      (SELECT COUNT(*)::text FROM posts
        WHERE created_at >= $1) AS post_count,
      ((SELECT COUNT(*) FROM follows
          WHERE created_at >= $2))::text AS follower_delta,
      (SELECT COUNT(DISTINCT tipper)::text FROM tips
        WHERE created_at >= $1) AS unique_tippers,
      (SELECT COUNT(DISTINCT author)::text FROM posts
        WHERE created_at >= $1) AS creator_count
    `,
    [windowStart, windowStartEpoch]
  );
  const row = result.rows[0];
  return {
    totalTips: BigInt(row?.total_tips ?? "0"),
    postCount: BigInt(row?.post_count ?? "0"),
    followerDelta: BigInt(row?.follower_delta ?? "0"),
    uniqueTippers: Number(row?.unique_tippers ?? 0),
    creatorCount: Number(row?.creator_count ?? 0),
  };
}

/** Aggregate a creator's current window using the indexer's timestamped domain tables. */
export async function fetchCreatorMetrics(
  db: Pool,
  creatorAddress: string,
  windowStart: Date
): Promise<CreatorMetrics> {
  const windowStartEpoch = Math.floor(windowStart.getTime() / 1000);
  const result = await db.query<{
    total_tips: string;
    post_count: string;
    follower_delta: string;
    unique_tippers: string;
  }>(
    `
    SELECT
      (SELECT COALESCE(SUM(t.amount), 0)::text
        FROM tips t JOIN posts p ON p.id = t.post_id
        WHERE p.author = $1 AND t.created_at >= $2) AS total_tips,
      (SELECT COUNT(*)::text FROM posts
        WHERE author = $1 AND created_at >= $2) AS post_count,
      (SELECT COUNT(*)::text FROM follows
        WHERE followee = $1 AND created_at >= $3) AS follower_delta,
      (SELECT COUNT(DISTINCT t.tipper)::text
        FROM tips t JOIN posts p ON p.id = t.post_id
        WHERE p.author = $1 AND t.created_at >= $2) AS unique_tippers
    `,
    [creatorAddress, windowStart, windowStartEpoch]
  );
  const row = result.rows[0];
  return {
    creatorAddress,
    totalTips: BigInt(row?.total_tips ?? "0"),
    postCount: BigInt(row?.post_count ?? "0"),
    followerDelta: BigInt(row?.follower_delta ?? "0"),
    uniqueTippers: Number(row?.unique_tippers ?? 0),
  };
}
