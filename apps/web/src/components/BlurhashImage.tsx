"use client";

/**
 * BlurhashImage.tsx
 *
 * Drop-in image component that shows a blurhash-decoded canvas placeholder
 * while the real image loads, then crossfades to the image once it is ready.
 *
 * Features:
 *  - No layout shift (CLS = 0): the container is sized by the explicit
 *    width/height props and never reflows on load.
 *  - Canvas placeholder rendered from the blurhash string via the
 *    `blurhash` library (decode + ImageData).
 *  - Smooth crossfade: placeholder opacity fades from 1 → 0 as image
 *    opacity transitions from 0 → 1.
 *  - Falls back gracefully when no blurhash string is provided —
 *    renders a neutral grey shimmer instead.
 *  - Fully accessible: forwards alt text and any extra img attributes.
 */

import React, {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type CSSProperties,
} from "react";
import { decode } from "blurhash";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlurhashImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** The real image URL. */
  src: string;
  /** Accessible description (required). */
  alt: string;
  /**
   * Blurhash string for the placeholder.
   * When omitted a plain grey shimmer is shown instead.
   */
  blurhash?: string;
  /**
   * Intrinsic width in pixels.
   * Required so the container can be sized before the image loads (no CLS).
   */
  width: number;
  /**
   * Intrinsic height in pixels.
   * Required so the container can be sized before the image loads (no CLS).
   */
  height: number;
  /** Extra class name applied to the outer wrapper div. */
  wrapperClassName?: string;
  /** Extra styles applied to the outer wrapper div. */
  wrapperStyle?: CSSProperties;
}

// Resolution of the blurhash decode canvas.  Higher = sharper blur preview;
// lower = faster decode. 32 × 32 is indistinguishable at normal sizes.
const DECODE_WIDTH = 32;
const DECODE_HEIGHT = 32;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Image component with blurhash placeholder and crossfade transition.
 *
 * @example
 * <BlurhashImage
 *   src="/uploads/photo.jpg"
 *   alt="A scenic view"
 *   blurhash="LGFFaXYk^6#M@-5c,1J5@[or[Q6."
 *   width={800}
 *   height={600}
 *   className="rounded-xl"
 * />
 */
export function BlurhashImage({
  src,
  alt,
  blurhash: blurhashString,
  width,
  height,
  wrapperClassName,
  wrapperStyle,
  className,
  style,
  onLoad,
  ...rest
}: BlurhashImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // ── Decode blurhash onto the canvas once the hash string is available ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !blurhashString) return;

    try {
      const pixels = decode(blurhashString, DECODE_WIDTH, DECODE_HEIGHT);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.createImageData(DECODE_WIDTH, DECODE_HEIGHT);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Invalid hash — canvas stays blank; the shimmer fallback is already visible.
    }
  }, [blurhashString]);

  // ── Shared aspect-ratio container style ──────────────────────────────
  const aspectRatio = width / height;

  const wrapperComputedStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    // Maintain the aspect ratio without knowing the rendered pixel size
    aspectRatio: `${width} / ${height}`,
    overflow: "hidden",
    ...wrapperStyle,
  };

  // ── Placeholder (canvas or shimmer) ──────────────────────────────────
  const placeholderStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    // Fade out once the image has loaded
    opacity: imageLoaded ? 0 : 1,
    transition: "opacity 0.35s ease",
    pointerEvents: "none",
  };

  // ── Real image ────────────────────────────────────────────────────────
  const imgStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    // Fade in once the image has loaded
    opacity: imageLoaded ? 1 : 0,
    transition: "opacity 0.35s ease",
    ...style,
  };

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageLoaded(true);
    onLoad?.(e);
  };

  return (
    <div
      className={wrapperClassName}
      style={wrapperComputedStyle}
      // Prevent layout contribution while the real image is pending
      aria-hidden={!imageLoaded ? "true" : undefined}
    >
      {/* Placeholder: blurhash canvas or grey shimmer */}
      {blurhashString ? (
        <canvas
          ref={canvasRef}
          width={DECODE_WIDTH}
          height={DECODE_HEIGHT}
          style={placeholderStyle}
          aria-hidden="true"
        />
      ) : (
        <div
          style={{
            ...placeholderStyle,
            background: "var(--color-surface-2, #e5e7eb)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
      )}

      {/* Real image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        style={imgStyle}
        className={className}
        onLoad={handleLoad}
        decoding="async"
        {...rest}
      />
    </div>
  );
}

export default BlurhashImage;
