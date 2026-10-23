import { Router, Request, Response } from "express";
import { Database } from "../../db";
import { validateParams, validateQuery } from "../../middleware/validate";
import { z } from "zod";
import { stellarAddressSchema } from "@linkora/types/src/schemas";
import { notFoundError } from "@linkora/types/src/errors";
import { profileCacheKey, QueryCache } from "../../cache";

const getProfileParamsSchema = z.object({
  address: stellarAddressSchema,
});
const searchProfileQuerySchema = z.object({
  username: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).refine(
  (query) => Boolean(query.username) !== Boolean(query.q),
  "provide exactly one of username or q"
);

export function createProfilesRouter(db: Database, cache?: QueryCache): Router {
  const router = Router();

  router.get(
    "/:address/reputation",
    validateParams(getProfileParamsSchema),
    async (req: Request, res: Response): Promise<void> => {
      const { address } = req.params;
      if (!db.getReputationScore) {
        res.status(501).json({ error: "Reputation scores are not available" });
        return;
      }

      const reputation = await db.getReputationScore(address);
      if (!reputation) {
        res.status(404).json({ error: "Reputation score not found" });
        return;
      }
      res.json(reputation);
    }
  );

  router.get(
    "/:address",
    validateParams(getProfileParamsSchema),
    async (req: Request, res: Response): Promise<void> => {
      const addressParam = req.params.address;
      const address = Array.isArray(addressParam) ? (addressParam[0] ?? "") : addressParam;

      const profile = cache
        ? await cache.getOrLoad(profileCacheKey(address), 60, () => db.getProfile(address))
        : await db.getProfile(address);
      if (!profile) {
        const err = notFoundError("Profile not found");
        res.status(err.statusCode).json(err.toJSON(req.context?.requestId));
        return;
      }

      res.json(profile);
    }
  );

  return router;
}
