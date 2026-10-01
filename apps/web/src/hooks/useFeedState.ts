"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Post } from "@/components/PostCard";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Built-in filter types for the feed.
 *
 * @remarks
 * ## How to Add a New Filter Type
 *
 * To add a new filter type to the system:
 *
 * 1. **Extend the type union**: Add your new literal to {@link FeedFilterType}:
 *    ```ts
 *    export type FeedFilterType = "all" | "following" | "trending" | "recent" | "media-only" | "bookmarked";
 *    ```
 *
 * 2. **Extend the filter interface**: If your filter requires custom parameters, add them to {@link FeedFilter}:
 *    ```ts
 *    export interface FeedFilter {
 *      type: FeedFilterType;
 *      minLikes?: number;
 *      author?: string;
 *      bookmarkedIds?: (string | number)[]; // ← your new parameter
 *    }
 *    ```
 *
 * 3. **Implement filtering logic**: Add a branch in {@link applyFilter}:
 *    ```ts
 *    case "media-only":
 *      return posts.filter((p) => Boolean(p.imageUrl));
 *    case "bookmarked":
 *      return posts.filter((p) => filter.bookmarkedIds?.includes(p.id));
 *    ```
 *
 * 4. **Update URL sync mappings** (optional):
 *    In {@link syncStateToUrl}, serialize your custom filter params:
 *    ```ts
 *    if (filter.type === "media-only") params.set("filter", "media-only");
 *    ```
 *    In {@link readStateFromUrl}, deserialize the URL param back into state:
 *    ```ts
 *    if (filterType === "media-only") result.filter = { type: "media-only" };
 *    ```
 */
export type FeedFilterType = "all" | "following" | "trending" | "recent";

/**
 * Filter configuration object for {@link useFeedState}.
 */
export interface FeedFilter {
  /** The active filter type. */
  type: FeedFilterType;
  /** Minimum like count threshold (applied when type is `"trending"`). */
  minLikes?: number;
  /** Filter posts by author wallet or account address. */
  author?: string;
}

/**
 * Supported sort orders for feed post ranking.
 */
export type FeedSortOrder = "newest" | "oldest" | "most-liked" | "most-tipped";

/**
 * Options configuration for the {@link useFeedState} hook.
 *
 * @example
 * ```tsx
 * const feedState = useFeedState({
 *   pageSize: 20,
 *   initialFilter: { type: "trending", minLikes: 5 },
 *   initialSort: "most-liked",
 *   syncToUrl: true,
 * });
 * ```
 */
export interface UseFeedStateOptions {
  /**
   * Number of items to fetch per page.
   * @defaultValue 10
   */
  pageSize?: number;

  /**
   * Filter applied when the hook mounts.
   * @defaultValue `{ type: "all" }`
   */
  initialFilter?: FeedFilter;

  /**
   * Sort order applied when the hook mounts.
   * @defaultValue `"newest"`
   */
  initialSort?: FeedSortOrder;

  /**
   * Whether to synchronize filter and sort selections with URL search parameters.
   *
   * @defaultValue false
   *
   * @remarks
   * ## URL Sync Implementation Guide
   *
   * When `syncToUrl` is set to `true`:
   *
   * - **URL to State**: On mount, search params are parsed using {@link readStateFromUrl}.
   *   URL parameters take precedence over `initialFilter` and `initialSort`.
   * - **State to URL**: When `filter` or `sortOrder` changes, {@link syncStateToUrl} updates
   *   the current browser URL via `window.history.replaceState`.
   * - **History preservation**: `replaceState` replaces the current history entry rather than pushing
   *   a new entry on every filter click, preventing user back-button exhaustion.
   * - **SSR safety**: All URL reads and writes check `typeof window !== "undefined"` to safely render on the server.
   *
   * ### Supported Query Parameters:
   * | Parameter | Maps to               | Example                 |
   * |-----------|-----------------------|-------------------------|
   * | `filter`  | `FeedFilter.type`     | `?filter=trending`      |
   * | `minLikes`| `FeedFilter.minLikes` | `&minLikes=10`          |
   * | `author`  | `FeedFilter.author`   | `&author=GABCD...`      |
   * | `sort`    | `FeedSortOrder`       | `&sort=most-liked`      |
   */
  syncToUrl?: boolean;
}

/**
 * Complete return interface of the {@link useFeedState} hook.
 */
export interface UseFeedStateReturn {
  /**
   * Filtered and sorted array of posts for the current page and filter configuration.
   * Memoized to preserve referential equality when data and filters are unchanged.
   */
  posts: Post[];

  /**
   * `true` while the initial page of posts is loading, `false` otherwise.
   */
  loading: boolean;

  /**
   * `true` while fetching subsequent pages (e.g., during infinite scroll or pagination), `false` otherwise.
   */
  loadingMore: boolean;

  /**
   * An error message string if the fetch operation failed, or `null` if healthy.
   */
  error: string | null;

  /**
   * `true` if additional posts remain to be fetched from the backend, `false` when all posts have been loaded.
   */
  hasMore: boolean;

  /**
   * Total number of posts loaded in memory that match the current filter criteria.
   */
  totalCount: number;

  /**
   * The currently active {@link FeedFilter} configuration.
   */
  filter: FeedFilter;

  /**
   * Sets a new filter configuration, resetting the pagination offset back to the beginning.
   *
   * @param filter - The new filter to apply.
   */
  setFilter: (filter: FeedFilter) => void;

  /**
   * The currently active sort order applied to the posts.
   */
  sortOrder: FeedSortOrder;

  /**
   * Sets a new sort order, re-sorting the active post list without refetching from the network.
   *
   * @param order - The new sort order.
   */
  setSortOrder: (order: FeedSortOrder) => void;

  /**
   * Triggers fetching the next page of posts if `hasMore` is true and a fetch is not already in progress.
   */
  loadMore: () => void;

  /**
   * Clears the current posts and refreshes the feed from the first page.
   */
  refresh: () => void;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Internal Helpers & URL Sync                                              */
/* ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_PAGE_SIZE = 10;

/**
 * Filter evaluation helper.
 *
 * @internal
 * @param posts - Unfiltered post array.
 * @param filter - Active filter configuration.
 * @returns Filtered post array.
 */
export function applyFilter(posts: Post[], filter: FeedFilter): Post[] {
  switch (filter.type) {
    case "all":
      return filter.author
        ? posts.filter((p) => p.author === filter.author)
        : posts;
    case "following":
      return filter.author
        ? posts.filter((p) => p.author === filter.author)
        : posts;
    case "trending": {
      const min = filter.minLikes ?? 5;
      return posts.filter((p) => Number(p.like_count ?? 0) >= min);
    }
    case "recent": {
      const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;
      return posts.filter((p) => {
        const ts = Number(p.timestamp ?? 0);
        return ts >= oneDayAgo;
      });
    }
    default:
      return posts;
  }
}

/**
 * Sort evaluation helper.
 *
 * @internal
 * @param posts - Unsorted post array.
 * @param order - Sort order to apply.
 * @returns New sorted post array.
 */
export function applySortOrder(posts: Post[], order: FeedSortOrder): Post[] {
  const sorted = [...posts];
  switch (order) {
    case "newest":
      return sorted.sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0));
    case "oldest":
      return sorted.sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));
    case "most-liked":
      return sorted.sort((a, b) => Number(b.like_count ?? 0) - Number(a.like_count ?? 0));
    case "most-tipped":
      return sorted.sort((a, b) => Number(b.tip_total ?? 0) - Number(a.tip_total ?? 0));
    default:
      return sorted;
  }
}

/**
 * Parses filter and sort state from the browser URL search query parameters.
 *
 * @internal
 * @returns Partial filter and sort state read from query string.
 */
export function readStateFromUrl(): { filter?: FeedFilter; sort?: FeedSortOrder } {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const filterType = params.get("filter") as FeedFilterType | null;
    const sort = params.get("sort") as FeedSortOrder | null;
    const minLikes = params.get("minLikes");
    const author = params.get("author");

    const result: { filter?: FeedFilter; sort?: FeedSortOrder } = {};

    if (filterType) {
      result.filter = {
        type: filterType,
        ...(minLikes ? { minLikes: parseInt(minLikes, 10) } : {}),
        ...(author ? { author } : {}),
      };
    }

    if (sort) {
      result.sort = sort;
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Synchronizes the current filter and sort state to the browser URL search parameters using replaceState.
 *
 * @internal
 * @param filter - Active filter configuration.
 * @param sort - Active sort order.
 */
export function syncStateToUrl(filter: FeedFilter, sort: FeedSortOrder): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams();
    if (filter.type !== "all") params.set("filter", filter.type);
    if (filter.minLikes !== undefined) params.set("minLikes", String(filter.minLikes));
    if (filter.author) params.set("author", filter.author);
    if (sort !== "newest") params.set("sort", sort);

    const qs = params.toString();
    const targetUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", targetUrl);
  } catch {
    // Gracefully ignore history errors in non-browser or sandbox environments
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Mock Fetch Layer (standing in for contract / indexer calls)               */
/* ────────────────────────────────────────────────────────────────────────── */

async function fetchPostBatch(offset: number, limit: number): Promise<Post[]> {
  const mockDataset: Post[] = [
    {
      id: "1",
      author: "GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      username: "stellar_dev",
      content: "Just deployed my first smart contract on Stellar! 🚀",
      tip_total: 100,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
      like_count: 5,
    },
    {
      id: "2",
      author: "GXYZ9876543210ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      username: "crypto_enthusiast",
      content: "The SocialFi ecosystem is growing fast. Excited to be part of it!",
      tip_total: 50,
      timestamp: Math.floor(Date.now() / 1000) - 7200,
      like_count: 3,
    },
    {
      id: "3",
      author: "GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      username: "stellar_dev",
      content: "Working on a new DeFi protocol. Stay tuned! 🔥",
      tip_total: 200,
      timestamp: Math.floor(Date.now() / 1000) - 14400,
      like_count: 12,
    },
  ];

  return mockDataset.slice(offset, offset + limit);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Hook Implementation                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * React hook that manages feed data, pagination, filtering, sorting, and URL sync.
 *
 * @param options - Configuration options for page size, initial filter, sort order, and URL sync.
 * @returns Object adhering to {@link UseFeedStateReturn} with post state and updater handlers.
 *
 * @example
 * ### Basic Example
 * ```tsx
 * import { useFeedState } from "@/hooks/useFeedState";
 *
 * function SimpleFeed() {
 *   const { posts, loading, error, hasMore, loadMore } = useFeedState({ pageSize: 10 });
 *
 *   if (loading) return <p>Loading feed...</p>;
 *   if (error) return <p>Error: {error}</p>;
 *
 *   return (
 *     <div>
 *       {posts.map((post) => (
 *         <article key={post.id}>
 *           <h3>{post.username}</h3>
 *           <p>{post.content}</p>
 *         </article>
 *       ))}
 *       {hasMore && <button onClick={loadMore}>Load More</button>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @example
 * ### Filter, Sort & URL Sync Example
 * ```tsx
 * import { useFeedState } from "@/hooks/useFeedState";
 *
 * function InteractiveFeed() {
 *   const {
 *     posts,
 *     filter,
 *     setFilter,
 *     sortOrder,
 *     setSortOrder,
 *     refresh,
 *   } = useFeedState({
 *     initialFilter: { type: "trending", minLikes: 5 },
 *     initialSort: "most-liked",
 *     syncToUrl: true,
 *   });
 *
 *   return (
 *     <div>
 *       <div className="controls">
 *         <button onClick={() => setFilter({ type: "all" })}>All</button>
 *         <button onClick={() => setFilter({ type: "trending", minLikes: 10 })}>Trending</button>
 *         <button onClick={() => setSortOrder("newest")}>Newest</button>
 *         <button onClick={() => setSortOrder("most-tipped")}>Top Tipped</button>
 *         <button onClick={refresh}>Refresh</button>
 *       </div>
 *
 *       <ul>
 *         {posts.map((p) => (
 *           <li key={p.id}>{p.content} ({p.like_count} likes)</li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 */
export function useFeedState(options: UseFeedStateOptions = {}): UseFeedStateReturn {
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    initialFilter = { type: "all" },
    initialSort = "newest",
    syncToUrl = false,
  } = options;

  // Read initial parameters from URL if enabled
  const initialUrlState = useRef(syncToUrl ? readStateFromUrl() : {});

  const [rawPosts, setRawPosts] = useState<Post[]>([]);
  const [filter, setFilterState] = useState<FeedFilter>(
    initialUrlState.current.filter ?? initialFilter
  );
  const [sortOrder, setSortOrderState] = useState<FeedSortOrder>(
    initialUrlState.current.sort ?? initialSort
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchInProgressRef = useRef(false);

  // ── Network Fetch ──────────────────────────────────────────────────────────
  const fetchPage = useCallback(
    async (pageIndex: number, reset: boolean) => {
      if (fetchInProgressRef.current) return;
      fetchInProgressRef.current = true;

      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const offset = pageIndex * pageSize;
        const batch = await fetchPostBatch(offset, pageSize);

        setRawPosts((prev: Post[]) => (reset ? batch : [...prev, ...batch]));
        setHasMore(batch.length >= pageSize);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch posts");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        fetchInProgressRef.current = false;
      }
    },
    [pageSize]
  );

  // ── Initial Fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchPage(0, true);
  }, [fetchPage]);

  // ── Pagination Change ──────────────────────────────────────────────────────
  useEffect(() => {
    if (page > 0) {
      fetchPage(page, false);
    }
  }, [page, fetchPage]);

  // ── Derived Filtered and Sorted Posts ──────────────────────────────────────
  const posts = useMemo(() => {
    const filtered = applyFilter(rawPosts, filter);
    return applySortOrder(filtered, sortOrder);
  }, [rawPosts, filter, sortOrder]);

  const totalCount = useMemo(() => {
    return applyFilter(rawPosts, filter).length;
  }, [rawPosts, filter]);

  // ── URL Synchronization Effect ─────────────────────────────────────────────
  useEffect(() => {
    if (syncToUrl) {
      syncStateToUrl(filter, sortOrder);
    }
  }, [filter, sortOrder, syncToUrl]);

  // ── Updaters ───────────────────────────────────────────────────────────────
  const setFilter = useCallback((nextFilter: FeedFilter) => {
    setFilterState(nextFilter);
    setPage(0);
    setRawPosts([]);
    fetchInProgressRef.current = false;
  }, []);

  const setSortOrder = useCallback((nextSort: FeedSortOrder) => {
    setSortOrderState(nextSort);
  }, []);

  const loadMore = useCallback(() => {
    if (!fetchInProgressRef.current && hasMore) {
      setPage((prev: number) => prev + 1);
    }
  }, [hasMore]);

  const refresh = useCallback(() => {
    setPage(0);
    setRawPosts([]);
    fetchInProgressRef.current = false;
    fetchPage(0, true);
  }, [fetchPage]);

  return {
    posts,
    loading,
    loadingMore,
    error,
    hasMore,
    totalCount,
    filter,
    setFilter,
    sortOrder,
    setSortOrder,
    loadMore,
    refresh,
  };
}
