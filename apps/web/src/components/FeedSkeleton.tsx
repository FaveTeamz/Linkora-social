"use client";

import { PostCardSkeleton } from "@/components/PostCardSkeleton";

/**
 * FeedSkeleton renders a stack of `PostCardSkeleton` placeholders while the
 * feed data is loading.
 *
 * ### `count` — matching the page size
 *
 * Pass the same value you use for the feed's page-limit query parameter. For
 * example, if your API call is:
 *
 * ```ts
 * const PAGE_SIZE = 10;
 * fetch(`/api/posts?limit=${PAGE_SIZE}`)
 * ```
 *
 * then render:
 *
 * ```tsx
 * <FeedSkeleton count={PAGE_SIZE} />
 * ```
 *
 * When `count` matches the page limit the skeleton occupies the same vertical
 * space as the real content will once it loads. A mismatch causes
 * **Cumulative Layout Shift (CLS)** — the page jumps as the skeleton is
 * replaced — which degrades both user experience and Core Web Vitals scores.
 *
 * A conservative fallback of `3` is used as the default so the component is
 * safe to drop in without configuration, but you should always pass an
 * explicit `count` that mirrors your actual page limit.
 *
 * ### CLS impact of a mismatched `count`
 *
 * | `count` vs real posts | Effect |
 * |-----------------------|--------|
 * | `count` < page limit  | Content appears below the fold on arrival → upward jump as short skeleton is replaced by a taller list |
 * | `count` > page limit  | Skeleton is taller than the real list → downward collapse on arrival |
 * | `count` === page limit | No layout shift — skeleton and real list occupy the same height |
 *
 * ### Example usage in `feed/page.tsx`
 *
 * ```tsx
 * import { FeedSkeleton } from "@/components/FeedSkeleton";
 *
 * const PAGE_SIZE = 10;
 *
 * export default function FeedPage() {
 *   const { posts, loading } = useFeed({ limit: PAGE_SIZE });
 *
 *   if (loading) {
 *     // count matches PAGE_SIZE to prevent CLS when content loads
 *     return <FeedSkeleton count={PAGE_SIZE} />;
 *   }
 *
 *   return <Feed posts={posts} />;
 * }
 * ```
 *
 * @param count - Number of skeleton cards to render. Should equal the
 *   `limit` parameter used in the feed query to avoid CLS. Defaults to `3`.
 */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-label="Loading feed" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}
