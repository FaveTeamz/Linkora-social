import { Router, Request, Response } from "express";
import { Database, TipRecord } from "../../db";
import { validateParams, validateQuery } from "../../middleware/validate";
import { stellarAddressSchema } from "@linkora/types/src/schemas";
import { internalError } from "@linkora/types/src/errors";
import { z } from "zod";

const postParamsSchema = z.object({ postId: z.string().regex(/^[1-9]\d*$/) });
const addressParamsSchema = z.object({ address: stellarAddressSchema });
const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z
    .string()
    .regex(/^\d+$/)
    .refine((value) => Number.isSafeInteger(Number(value)))
    .optional(),
});
const totalsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function serializeTip(tip: TipRecord) {
  return {
    ...tip,
    post_id: tip.post_id.toString(),
    amount: tip.amount.toString(),
    fee: tip.fee.toString(),
    created_at: tip.created_at.toISOString(),
  };
}

export function createTipsRouter(db: Database): Router {
  const router = Router();

  async function sendPage(
    res: Response,
    requestId: string | undefined,
    fetchPage: (limit: number, offset: number) => ReturnType<Database["listTipsByPost"]>,
    limit: number,
    offset: number
  ): Promise<void> {
    try {
      const { tips, total } = await fetchPage(limit, offset);
      res.json({
        tips: tips.map(serializeTip),
        total,
        limit,
        cursor: String(offset),
        next_cursor: offset + tips.length < total ? String(offset + tips.length) : null,
      });
    } catch {
      const err = internalError("Failed to fetch tip history");
      res.status(err.statusCode).json(err.toJSON(requestId));
    }
  }

  router.get(
    "/by-post/:postId",
    validateParams(postParamsSchema),
    validateQuery(pageQuerySchema),
    async (req: Request, res: Response): Promise<void> => {
      const { limit, cursor } = req.query as unknown as z.infer<typeof pageQuerySchema>;
      await sendPage(
        res,
        req.context?.requestId,
        (pageLimit, offset) => db.listTipsByPost(BigInt(req.params.postId), pageLimit, offset),
        limit,
        Number(cursor ?? 0)
      );
    }
  );

  for (const direction of ["received", "sent"] as const) {
    router.get(
      `/${direction}/:address`,
      validateParams(addressParamsSchema),
      validateQuery(pageQuerySchema),
      async (req: Request, res: Response): Promise<void> => {
        const { limit, cursor } = req.query as unknown as z.infer<typeof pageQuerySchema>;
        const list = direction === "received" ? db.listTipsReceived : db.listTipsSent;
        await sendPage(
          res,
          req.context?.requestId,
          (pageLimit, offset) => list.call(db, req.params.address, pageLimit, offset),
          limit,
          Number(cursor ?? 0)
        );
      }
    );
  }

  router.get(
    "/totals/:address",
    validateParams(addressParamsSchema),
    validateQuery(totalsQuerySchema),
    async (req: Request, res: Response): Promise<void> => {
      const { from, to } = req.query as unknown as z.infer<typeof totalsQuerySchema>;
      const start = from ? new Date(from) : undefined;
      const end = to ? new Date(to) : undefined;
      if (start && end && start >= end) {
        res.status(400).json({ error: "from must be earlier than to" });
        return;
      }
      try {
        const totals = await db.getTipTotals(req.params.address, start, end);
        res.json({
          sent_count: totals.sent_count,
          sent_amount: totals.sent_amount.toString(),
          sent_fee: totals.sent_fee.toString(),
          received_count: totals.received_count,
          received_amount: totals.received_amount.toString(),
          received_fee: totals.received_fee.toString(),
          from: start?.toISOString() ?? null,
          to: end?.toISOString() ?? null,
        });
      } catch {
        const err = internalError("Failed to fetch tip totals");
        res.status(err.statusCode).json(err.toJSON(req.context?.requestId));
      }
    }
  );

  return router;
}
