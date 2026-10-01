/**
 * @module FeedSkeleton
 *
 * Renders a configurable stack of animated placeholder cards that mirror the
 * layout of a real post card. Shown while the initial feed page is loading
 * so the UI feels responsive even before data arrives.
 *
 * Uses CSS `animate-pulse` (Tailwind) to convey that content is in transit.
 * No data props are required — the component is purely presentational.
 *
 * @example
 * ```tsx
 * import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
 *
 * // Show 3 skeleton cards while the first page of posts loads
 * if (loading) return <FeedSkeleton count={3} />;
 * ```
 */

"use client";

import React from "react";

// ─── Props interface ──────────────────────────────────────────────────────────

/**
 * Props for the {@link FeedSkeleton} component.
 */
export interface FeedSkeletonProps {
  /**
   * Number of skeleton post-card placeholders to render.
   *
   * A count of 3 is generally enough to fill a typical viewport without
   * causing layout jank when real cards swap in.
   *
   * @defaultValue `3`
   */
  count?: number;

  /**
   * When `true` each skeleton card includes a wider content area placeholder,
   * matching the taller "masonry" card variant used on mobile.
   *
   * @defaultValue `false`
   */
  masonry?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Base class shared by all skeleton shimmer blocks. */
const SHIMMER =
  "rounded-lg bg-[var(--muted)] animate-pulse";

/**
 * A single animated post-card placeholder.
 *
 * Replicates the rough shape of a {@link PostCard}:
 * - Avatar circle + display-name line
 * - Two or three lines of body text
 * - Action row (like / tip button shapes)
 */
function SkeletonCard({ masonry = false }: { masonry?: boolean }) {
  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-4 space-y-3"
      aria-hidden="true"
    >
      {/* Header: avatar + name */}
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-full flex-shrink-0 ${SHIMMER}`} />
        <div className="flex-1 space-y-1.5">
          <div className={`h-3.5 w-32 ${SHIMMER}`} />
          <div className={`h-3 w-24 ${SHIMMER}`} />
        </div>
      </div>

      {/* Body text lines */}
      <div className="space-y-2">
        <div className={`h-3.5 w-full ${SHIMMER}`} />
        <div className={`h-3.5 w-5/6 ${SHIMMER}`} />
        {masonry && <div className={`h-3.5 w-4/6 ${SHIMMER}`} />}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-4 pt-1">
        <div className={`h-7 w-16 rounded-full ${SHIMMER}`} />
        <div className={`h-7 w-16 rounded-full ${SHIMMER}`} />
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Loading skeleton for the Linkora feed.
 *
 * Renders `count` stacked {@link SkeletonCard} placeholders. Each card
 * pulses with `animate-pulse` to signal that content is being fetched.
 *
 * The entire group is wrapped in a `<div role="status">` with a visually
 * hidden label so screen readers announce "Loading feed" instead of
 * reading the invisible placeholder shapes.
 *
 * @param props - {@link FeedSkeletonProps}
 *
 * @example
 * ```tsx
 * // Standard list skeleton
 * <FeedSkeleton count={3} />
 *
 * // Taller masonry-style skeleton for mobile
 * <FeedSkeleton count={2} masonry />
 * ```
 */
export function FeedSkeleton({ count = 3, masonry = false }: FeedSkeletonProps) {
  return (
    <div role="status" aria-label="Loading feed" className="space-y-4">
      <span className="sr-only">Loading feed…</span>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} masonry={masonry} />
      ))}
    </div>
  );
}

export default FeedSkeleton;
