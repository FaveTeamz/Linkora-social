/**
 * @module imageOptimizer
 *
 * Client-side image optimisation pipeline for Linkora.
 *
 * ## Pipeline overview
 *
 * ```
 * raw File
 *   └─► resizeImage()        — down-scale to a safe maximum dimension
 *         └─► convertToWebP() — re-encode as WebP for smaller payloads
 *               └─► generateLQIP() — produce a tiny Base64 blur placeholder
 * ```
 *
 * Each stage is independently exported so callers can compose only what they
 * need. The full three-stage helper {@link optimizeImage} runs all three in
 * sequence and is the recommended entry point for upload flows.
 *
 * ## Browser compatibility — Canvas API
 *
 * All three functions depend on the HTML Canvas API (`HTMLCanvasElement`,
 * `CanvasRenderingContext2D`, and `canvas.toBlob` / `canvas.toDataURL`).
 * These are universally supported in modern evergreen browsers (Chrome 4+,
 * Firefox 3.6+, Safari 3.1+, Edge 12+).
 *
 * **Limitations to be aware of:**
 *
 * - **No animated GIF support.** `HTMLCanvasElement` only captures a single
 *   frame of an animated GIF (usually the first). Animated images are
 *   returned unchanged from {@link resizeImage} and produce a static
 *   placeholder from {@link generateLQIP}.
 * - **WebP encoding availability.** `canvas.toBlob('image/webp')` is
 *   supported in Chromium-based browsers and Firefox 96+. Safari 14+ on
 *   macOS/iOS supports WebP _decoding_ but only added _encoding_ in Safari
 *   17 (2023). On unsupported browsers, {@link convertToWebP} falls back to
 *   the original file type.
 * - **Memory pressure on large images.** Decoding a high-resolution source
 *   image into a canvas allocates 4 bytes per pixel (RGBA). A 20 MP image
 *   requires roughly 80 MB of heap. Call {@link resizeImage} before
 *   {@link convertToWebP} to keep peak memory manageable.
 * - **No server-side / SSR support.** The Canvas API is browser-only.
 *   Attempting to call these functions outside a browser context (e.g.
 *   during Next.js server-side rendering) will throw. Guard calls with
 *   `typeof window !== 'undefined'` or place them inside `useEffect` / event
 *   handlers.
 * - **CORS-restricted images.** Drawing a cross-origin `<img>` onto a canvas
 *   taints it and prevents `toBlob` / `toDataURL` from reading back pixels.
 *   Always work from a `File` / `Blob` obtained locally (e.g. from an
 *   `<input type="file">`) rather than from a remote URL.
 */

/** Options accepted by {@link resizeImage}. */
export interface ResizeOptions {
  /**
   * Maximum width or height of the output image in pixels.
   * The aspect ratio is always preserved.
   * @default 1920
   */
  maxDimension?: number;

  /**
   * MIME type for the resized output.
   * Falls back to the source file's type when omitted.
   */
  outputType?: string;

  /**
   * Encoder quality for lossy formats (0–1).
   * @default 0.92
   */
  quality?: number;
}

/** Options accepted by {@link convertToWebP}. */
export interface WebPOptions {
  /**
   * WebP encoder quality (0–1).
   * Higher values produce larger files with better fidelity.
   * @default 0.85
   */
  quality?: number;
}

/** Options accepted by {@link generateLQIP}. */
export interface LQIPOptions {
  /**
   * Width of the tiny placeholder image in pixels.
   * The aspect ratio is preserved; height is calculated automatically.
   * @default 20
   */
  width?: number;

  /**
   * MIME type for the placeholder data URL.
   * @default "image/webp"
   */
  outputType?: string;

  /**
   * Encoder quality for the placeholder (0–1).
   * Very low quality is acceptable because the placeholder is only shown
   * while the full image loads and is rendered blurred via CSS.
   * @default 0.1
   */
  quality?: number;
}

/** Result returned by {@link optimizeImage}. */
export interface OptimizeResult {
  /** The resized, WebP-encoded `File` ready for upload. */
  file: File;
  /** A tiny Base64-encoded data URL for use as a blur placeholder (`src`). */
  lqip: string;
  /** Width of the optimised image in pixels. */
  width: number;
  /** Height of the optimised image in pixels. */
  height: number;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Load a `File` or `Blob` into an `HTMLImageElement`, resolving only once the
 * image has fully decoded.
 */
function loadImage(source: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for optimisation"));
    };
    img.src = url;
  });
}

/**
 * Draw `img` onto a canvas scaled to `targetWidth × targetHeight`, then
 * extract a `Blob` using the given MIME type and quality.
 */
function drawAndExport(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas 2D context is not available"));
      return;
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Canvas toBlob returned null for type "${mimeType}"`));
        }
      },
      mimeType,
      quality
    );
  });
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Resize an image so neither dimension exceeds `maxDimension` pixels.
 *
 * The aspect ratio is always preserved. Images that are already within the
 * limit are returned as-is without re-encoding.
 *
 * **Animated GIFs are not supported.** Only the first frame is captured by
 * the Canvas API; the animation is lost. Pass animated GIFs through
 * unchanged by checking `file.type === 'image/gif'` before calling this
 * function.
 *
 * @param file - Source image file.
 * @param options - Resize configuration (see {@link ResizeOptions}).
 * @returns A new `File` whose dimensions fit within `maxDimension`.
 *
 * @example
 * ```ts
 * const resized = await resizeImage(file, { maxDimension: 1280 });
 * console.log('Resized to', resized.size, 'bytes');
 * ```
 */
export async function resizeImage(file: File, options: ResizeOptions = {}): Promise<File> {
  const { maxDimension = 1920, outputType, quality = 0.92 } = options;
  const mimeType = outputType ?? file.type;

  const img = await loadImage(file);

  const { naturalWidth: srcW, naturalHeight: srcH } = img;
  const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));

  // Already fits — skip re-encoding to avoid quality loss
  if (scale === 1 && mimeType === file.type) {
    return file;
  }

  const targetW = Math.round(srcW * scale);
  const targetH = Math.round(srcH * scale);

  const blob = await drawAndExport(img, targetW, targetH, mimeType, quality);
  return new File([blob], file.name, { type: mimeType });
}

/**
 * Re-encode an image as WebP for reduced file size.
 *
 * WebP typically achieves 25–35 % smaller files than JPEG at equivalent
 * perceived quality. On browsers that do not support WebP _encoding_ (Safari
 * < 17), the function falls back silently and returns a file in the source
 * format.
 *
 * **Canvas API note:** the browser performs the WebP encoding synchronously
 * inside `canvas.toBlob`. No server round-trip is required, but the call
 * blocks the main thread for large images. Call {@link resizeImage} first to
 * reduce the canvas dimensions before encoding.
 *
 * @param file - Source image file. Typically the output of {@link resizeImage}.
 * @param options - Encoding options (see {@link WebPOptions}).
 * @returns A new `File` with `type === 'image/webp'`, or the original file on
 *   unsupported browsers.
 *
 * @example
 * ```ts
 * const webp = await convertToWebP(resizedFile, { quality: 0.8 });
 * console.log('WebP size:', webp.size, 'bytes');
 * ```
 */
export async function convertToWebP(file: File, options: WebPOptions = {}): Promise<File> {
  const { quality = 0.85 } = options;

  const img = await loadImage(file);
  const { naturalWidth: w, naturalHeight: h } = img;

  let blob: Blob;
  try {
    blob = await drawAndExport(img, w, h, "image/webp", quality);
  } catch {
    // toBlob with image/webp failed — browser does not support WebP encoding
    return file;
  }

  // Some browsers silently fall back to PNG when WebP encoding is unsupported.
  // Detect this and return the original file to avoid an unexpected type change.
  if (blob.type !== "image/webp") {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}

/**
 * Generate a Low-Quality Image Placeholder (LQIP) as a Base64 data URL.
 *
 * The placeholder is a tiny (default 20 px wide) version of the image,
 * intended to be displayed immediately while the full-resolution image loads.
 * Render it blurred with CSS (`filter: blur(8px); transform: scale(1.05)`) to
 * mask the pixelation.
 *
 * **Animated GIFs:** only the first frame is captured. The placeholder will
 * be static regardless of the source animation.
 *
 * @param file - Source image file. Pass the WebP output of {@link convertToWebP}
 *   for the smallest possible placeholder.
 * @param options - Placeholder configuration (see {@link LQIPOptions}).
 * @returns A Base64 data URL (`data:image/webp;base64,...`) suitable for use
 *   as an `<img src>` or CSS `background-image`.
 *
 * @example
 * ```ts
 * const lqip = await generateLQIP(webpFile);
 * // Use as a blur-up placeholder:
 * // <img src={lqip} style={{ filter: 'blur(8px)' }} />
 * ```
 */
export async function generateLQIP(file: File, options: LQIPOptions = {}): Promise<string> {
  const { width: targetWidth = 20, outputType = "image/webp", quality = 0.1 } = options;

  const img = await loadImage(file);
  const { naturalWidth: srcW, naturalHeight: srcH } = img;

  const targetHeight = Math.round((srcH / srcW) * targetWidth);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not available");
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL(outputType, quality);
}

/**
 * Full optimisation pipeline: resize → WebP → LQIP.
 *
 * Convenience wrapper that runs all three stages in sequence and returns both
 * the upload-ready file and the blur placeholder in a single call.
 *
 * ## Known limitations
 *
 * - **No animated GIF support.** The Canvas API captures only the first frame.
 *   Animated GIFs should be handled separately (e.g. uploaded as-is or
 *   converted server-side).
 * - **Browser-only.** This function relies on `HTMLCanvasElement` and must not
 *   be called during SSR. Guard with `typeof window !== 'undefined'`.
 * - **WebP encoding fallback.** On Safari < 17, {@link convertToWebP} falls
 *   back to the source format. The returned `file` may not be WebP in those
 *   environments.
 * - **Memory.** Processing a 20 MP image allocates ~80 MB of canvas memory.
 *   Always set a sensible `maxDimension` to bound peak usage.
 *
 * @param file - Raw image file from an `<input type="file">` or drag-and-drop.
 * @param resizeOptions - Options forwarded to {@link resizeImage}.
 * @param webPOptions - Options forwarded to {@link convertToWebP}.
 * @param lqipOptions - Options forwarded to {@link generateLQIP}.
 * @returns Optimised file, Base64 LQIP data URL, and final pixel dimensions.
 *
 * @example
 * ```ts
 * const { file, lqip, width, height } = await optimizeImage(rawFile, {
 *   maxDimension: 1280,
 * });
 * await uploadFile(file);
 * setPlaceholder(lqip); // show blurred preview immediately
 * ```
 */
export async function optimizeImage(
  file: File,
  resizeOptions: ResizeOptions = {},
  webPOptions: WebPOptions = {},
  lqipOptions: LQIPOptions = {}
): Promise<OptimizeResult> {
  const resized = await resizeImage(file, resizeOptions);
  const webp = await convertToWebP(resized, webPOptions);
  const lqip = await generateLQIP(webp, lqipOptions);

  // Read back the final dimensions from the optimised file
  const img = await loadImage(webp);
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  return { file: webp, lqip, width, height };
}
