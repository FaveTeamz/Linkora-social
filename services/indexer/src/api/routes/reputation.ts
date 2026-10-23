import { Router } from "express";
import { Pool } from "pg";
import { z } from "zod";
import { validateParams, validateQuery } from "../../middleware/validate";
import { stellarAddressSchema } from "@linkora/types/src/schemas";

const addressSchema = z.object({ address: stellarAddressSchema });
const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export function createReputationRouter(db: Pool): Router {
  const router = Router();

  router.get(
    "/leaderboard",
    validateQuery(leaderboardQuerySchema),
    async (req, res): Promise<void> => {
      const { limit, offset } = req.query as unknown as z.infer<typeof leaderboardQuerySchema>;
      const result = await db.query(
        `SELECT user_address, score, posts_count, tips_sent, tips_received,
                governance_votes, last_computed_at, updated_ledger
         FROM reputation_scores
         ORDER BY score DESC, user_address ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      res.json({
        entries: result.rows.map((row, index) => ({
          rank: offset + index + 1,
          address: row.user_address,
          score: row.score,
          postsCount: row.posts_count,
          tipsSent: row.tips_sent,
          tipsReceived: row.tips_received,
          governanceVotes: row.governance_votes,
          lastComputedAt: row.last_computed_at,
          updatedLedger: row.updated_ledger,
        })),
        limit,
        offset,
      });
    }
  );

  router.get(
    "/:address",
    validateParams(addressSchema),
    async (req, res): Promise<void> => {
      const { address } = req.params;
      const result = await db.query(
        `SELECT user_address, score, posts_count, tips_sent, tips_received,
                governance_votes, last_computed_at, updated_ledger
         FROM reputation_scores WHERE user_address = $1`,
        [address]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: "reputation score not found", address });
        return;
      }
      const row = result.rows[0];
      res.json({
        address: row.user_address,
        score: row.score,
        postsCount: row.posts_count,
        tipsSent: row.tips_sent,
        tipsReceived: row.tips_received,
        governanceVotes: row.governance_votes,
        lastComputedAt: row.last_computed_at,
        updatedLedger: row.updated_ledger,
      });
    }
  );

  return router;
}
