import { Router, Request, Response } from "express";
import { Database } from "../../db";
import { validateParams } from "../../middleware/validate";
import { z } from "zod";
import { stellarAddressSchema } from "@linkora/types/src/schemas";
import { notFoundError } from "@linkora/types/src/errors";
import { profileCacheKey, QueryCache } from "../../cache";

const getProfileParamsSchema = z.object({
  address: stellarAddressSchema,
});

export function createProfilesRouter(db: Database, cache?: QueryCache): Router {
  const router = Router();

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
