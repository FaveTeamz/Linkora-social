import express, { Request, Response } from "express";
import helmet from "helmet";
import sharp from "sharp";

const PORT = parseInt(process.env.PORT ?? "3003", 10);

const app = express();
app.use(helmet());

// ── Health endpoint ────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  // Confirm sharp is loaded and libvips is available
  const sharpVersions = sharp.versions;
  res.json({ status: "ok", service: "media", sharp: sharpVersions });
});

// ── Readiness probe ────────────────────────────────────────────────────────
app.get("/health/ready", (_req: Request, res: Response) => {
  res.json({ status: "ready", service: "media" });
});

// ── Resize endpoint ────────────────────────────────────────────────────────
// POST /resize?width=800&height=600
// Body: raw image bytes (Content-Type: image/*)
app.post(
  "/resize",
  express.raw({ type: "image/*", limit: process.env.MAX_UPLOAD_BYTES ?? "10mb" }),
  async (req: Request, res: Response) => {
    const width = parseInt(String(req.query.width ?? "800"), 10);
    const height = parseInt(String(req.query.height ?? "600"), 10);

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "request body must be a raw image" });
      return;
    }

    try {
      const output = await sharp(req.body)
        .resize(width, height, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      res.set("Content-Type", "image/webp");
      res.send(output);
    } catch (_err) {
      res.status(422).json({ error: "image processing failed" });
    }
  }
);

// ── Start server ───────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[media] listening on port ${PORT}`);
});

// Graceful shutdown
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default app;
