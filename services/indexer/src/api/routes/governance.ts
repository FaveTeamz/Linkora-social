import { Router, Request, Response } from "express";
import { Database } from "../../db";
import { validateParams, validateQuery } from "../../middleware/validate";
import { stellarAddressSchema } from "@linkora/types/src/schemas";
import { internalError, notFoundError } from "@linkora/types/src/errors";
import { z } from "zod";

const proposalIdSchema = z.object({ id: z.string().regex(/^[1-9]\d*$/) });
const proposalsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().regex(/^\d+$/).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.string().min(1).optional(),
});
const votingPowerParamsSchema = z.object({ address: stellarAddressSchema });

export function createGovernanceRouter(db: Database): Router {
  const router = Router();

  router.get(
    "/proposals",
    validateQuery(proposalsQuerySchema),
    async (req: Request, res: Response): Promise<void> => {
      const { limit, cursor, offset: requestedOffset, status } = req.query as unknown as z.infer<typeof proposalsQuerySchema>;
      const offset = cursor === undefined ? (requestedOffset ?? 0) : Number(cursor);

      try {
        const { proposals, total } = await db.listGovernanceProposals({
          limit,
          offset,
          status,
        });

        const serializedProposals = proposals.map((p) => ({
          ...p,
          proposal_id: p.proposal_id.toString(),
          new_value: p.new_value.toString(),
          votes_for: p.votes_for.toString(),
          votes_against: p.votes_against.toString(),
        }));

        res.json({
          proposals: serializedProposals,
          total,
          limit,
          offset,
          has_more: offset + proposals.length < total,
          next_cursor: offset + proposals.length < total ? String(offset + proposals.length) : null,
        });
      } catch (error) {
        const err = internalError("Failed to list proposals");
        res.status(err.statusCode).json(err.toJSON(req.context?.requestId));
      }
    }
  );

  router.get(
    "/proposals/:id",
    validateParams(proposalIdSchema),
    async (req: Request, res: Response): Promise<void> => {
      const id = BigInt(req.params.id);
      try {
        const proposal = await db.getGovernanceProposal(id);
        if (!proposal) {
          const err = notFoundError("Governance proposal not found");
          res.status(err.statusCode).json(err.toJSON(req.context?.requestId));
          return;
        }
        res.json({
          ...proposal,
          proposal_id: proposal.proposal_id.toString(),
          new_value: proposal.new_value.toString(),
          votes_for: proposal.votes_for.toString(),
          votes_against: proposal.votes_against.toString(),
        });
      } catch {
        const err = internalError("Failed to get proposal");
        res.status(err.statusCode).json(err.toJSON(req.context?.requestId));
      }
    }
  );

  router.get(
    "/voting-power/:address",
    validateParams(votingPowerParamsSchema),
    (req: Request, res: Response): void => {
      // Governance currently assigns one vote per authenticated wallet.
      res.json({ address: req.params.address, voting_power: "1" });
    }
  );

  return router;
}
