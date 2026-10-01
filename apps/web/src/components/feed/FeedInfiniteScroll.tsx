/**
 * @module FeedInfiniteScroll
 *
 * Provides an **IntersectionObserver**-based infinite-scroll sentinel for the
 * Linkora feed. When the sentinel element enters the viewport the component
 * fires `onLoadMore`, allowing the parent to append the next page of posts.
 *
 * The component handles its own observer lifecycle — it attaches on mount,
 * cleans up on unmount, and re-registers whenever its dependencies change
 * (e.g. `loading` transitions from `true` to `false`).
 *
 * It also renders the **"Loading more…"** spinner and the **end-of-feed**
 * message so callers do not need to duplicate that UI.
 *
 * @example
 * ```tsx
 * import { FeedInfiniteScroll } from "@/components/feed/FeedInfiniteScroll";
 *
 * export function MyFeed() {
 *   const [posts, setPosts] = React.useState<Post[]>([]);
 *   const [hasMore, setHasMore] = React.useState(true);
 *   const [loading, setLoading] = React.useState(false);
 *
 *   const handleLoadMore = async () => {
 *     setLoading(true);
 *     const next = await fetchNextPage();
 *     setPosts((prev) => [...prev, ...next.posts]);
 *     setHasMore(next.hasMore);
 *     setLoading(false);
 *   };
 *
 *   return (
 *     <>
 *       {posts.map((p) => <PostCard key={p.id} post={p} />)}
 *       <FeedInfiniteScroll
 *         hasMore={hasMore}
 *         loading={loading}
 *         onLoadMore={handleLoadMore}
 *       />
 *     </>
 *   );
 * }
 * ```
 */

"use client";

import React, { useRef, useEffect } from "react";

// ─── Props interface ──────────────────────────────────────────────────────────

/**
 * Props for the {@link FeedInfiniteScroll} component.
 */
export interface FeedInfiniteScrollProps {
  /**
   * Whether more pages exist beyond the currently loaded set.
   *
   * When `false` the sentinel is hidden and the observer is not registered,
   * preventing spurious `onLoadMore` calls at the end of the list.
   */
  hasMore: boolean;

  /**
   * Whether a page fetch is currently in flight.
   *
   * When `true` the loading spinner is shown and the observer temporarily
   * stops watching the sentinel to avoid double-firing `onLoadMore` while a
   * request is already pending.
   */
  loading: boolean;

  /**
   * Callback invoked when the sentinel element enters the viewport and
   * `hasMore` is `true` and `loading` is `false`.
   *
   * The parent is responsible for fetching the next page and updating its
   * own `hasMore` / `loading` state.
   */
  onLoadMore: () => void;

  /**
   * Distance (in CSS) from the bottom of the viewport at which the observer
   * fires, expressed as a `rootMargin` value.
   *
   * Increase this value to trigger loading earlier (e.g. `"300px"`) or
   * decrease it to trigger later (e.g. `"50px"`).
   *
   * @defaultValue `"150px"`
   */
  rootMargin?: string;

  /**
   * Text shown below the spinner while a page is loading.
   *
   * @defaultValue `"Loading more posts…"`
   */
  loadingLabel?: string;

  /**
   * Text shown when `hasMore` is `false`, indicating the viewer has reached
   * the end of the feed.
   *
   * @defaultValue `"You're all caught up!"`
   */
  endLabel?: string;
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

/** Accessible SVG spinner used while additional pages are loading. */
function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-[var(--text-muted)]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Infinite-scroll sentinel for the Linkora feed.
 *
 * Place this component **below** the last post card in the list. It renders
 * an invisible sentinel `<div>` and uses `IntersectionObserver` to fire
 * `onLoadMore` when the sentinel is about to enter the viewport.
 *
 * The observer lifecycle is managed internally:
 * - Attaches after the initial render.
 * - Detaches while `loading` is `true` to prevent duplicate requests.
 * - Detaches entirely when `hasMore` is `false`.
 * - Cleans up on unmount.
 *
 * @param props - {@link FeedInfiniteScrollProps}
 *
 * @example
 * ```tsx
 * <FeedInfiniteScroll hasMore={hasMore} loading={loadingMore} onLoadMore={loadNextPage} />
 * ```
 */
export function FeedInfiniteScroll({
  hasMore,
  loading,
  onLoadMore,
  rootMargin = "150px",
  loadingLabel = "Loading more posts…",
  endLabel = "You're all caught up!",
}: FeedInfiniteScrollProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin }
    );

    const el = sentinelRef.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [loading, hasMore, onLoadMore, rootMargin]);

  if (!hasMore) {
    return (
      <p className="py-8 text-center text-sm text-[var(--text-muted)]" aria-live="polite">
        {endLabel}
      </p>
    );
  }

  return (
    <div ref={sentinelRef} className="py-6 text-center" aria-live="polite">
      {loading && (
        <div className="flex items-center justify-center gap-2">
          <Spinner />
          <span className="text-sm text-[var(--text-muted)]">{loadingLabel}</span>
        </div>
      )}
    </div>
  );
}

export default FeedInfiniteScroll;
