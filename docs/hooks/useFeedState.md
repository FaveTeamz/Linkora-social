# `useFeedState` Hook API Reference & Extension Guide

The `useFeedState` hook provides unified feed state management for Linkora web applications, encapsulating pagination, client-side filtering, multi-metric sorting, and bidirectional URL synchronization.

- **File:** [`apps/web/src/hooks/useFeedState.ts`](../../apps/web/src/hooks/useFeedState.ts)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [API Reference](#api-reference)
   - [Options (`UseFeedStateOptions`)](#options-usefeedstateoptions)
   - [Return Value (`UseFeedStateReturn`)](#return-value-usefeedstatereturn)
3. [URL Sync Implementation Guide](#url-sync-implementation-guide)
4. [Extension Guide: Adding a New Filter Type](#extension-guide-adding-a-new-filter-type)
5. [Usage Examples](#usage-examples)

---

## Quick Start

```tsx
import { useFeedState } from "@/hooks/useFeedState";
import { PostCard } from "@/components/PostCard";

export function FeedList() {
  const { posts, loading, error, hasMore, loadMore } = useFeedState({
    pageSize: 10,
    initialFilter: { type: "all" },
    initialSort: "newest",
  });

  if (loading) return <div>Loading posts...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasMore && <button onClick={loadMore}>Load More</button>}
    </div>
  );
}
```

---

## API Reference

### Options (`UseFeedStateOptions`)

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `pageSize` | `number` | `10` | The batch size for each paginated fetch request. |
| `initialFilter` | `FeedFilter` | `{ type: "all" }` | Initial filter applied on hook initialization if no URL parameter is found. |
| `initialSort` | `FeedSortOrder` | `"newest"` | Initial sort order applied to the posts list. |
| `syncToUrl` | `boolean` | `false` | When true, synchronizes active filter and sort state with browser URL search parameters. |

### Return Value (`UseFeedStateReturn`)

Every property returned by `useFeedState` is documented below:

| Property | Type | Description |
| :--- | :--- | :--- |
| `posts` | `Post[]` | Array of posts matching the active filter and sorted according to `sortOrder`. Referential identity is maintained across rerenders when underlying data and filters remain equal. |
| `loading` | `boolean` | `true` while the initial page of posts is in-flight, `false` otherwise. |
| `loadingMore` | `boolean` | `true` when fetching subsequent pages during pagination or infinite scroll. |
| `error` | `string \| null` | Error message string if an error occurred during fetch, or `null` when healthy. |
| `hasMore` | `boolean` | Indicates whether more items remain on the server to be fetched. |
| `totalCount` | `number` | Count of posts loaded in memory that satisfy the current filter predicate. |
| `filter` | `FeedFilter` | The current filter configuration object. |
| `setFilter` | `(filter: FeedFilter) => void` | Updates the active filter, resetting pagination back to page 0. |
| `sortOrder` | `FeedSortOrder` | The active sorting metric (`"newest"`, `"oldest"`, `"most-liked"`, `"most-tipped"`). |
| `setSortOrder` | `(order: FeedSortOrder) => void` | Updates the active sort order and re-sorts posts in memory without network refetch. |
| `loadMore` | `() => void` | Requests the next page of posts if `hasMore` is true and no request is currently in-flight. |
| `refresh` | `() => void` | Resets pagination to page 0, clears posts, and re-fetches from the remote data source. |

---

## URL Sync Implementation Guide

When `syncToUrl: true` is configured:

1. **Initial Hydration**:
   On mount, `readStateFromUrl()` inspects `window.location.search`. If valid query parameters exist, they take precedence over `initialFilter` and `initialSort`.

2. **Parameter Mapping**:
   | Query Parameter | Target State | Example |
   | :--- | :--- | :--- |
   | `filter` | `filter.type` | `?filter=trending` |
   | `minLikes` | `filter.minLikes` | `&minLikes=10` |
   | `author` | `filter.author` | `&author=GABCD...` |
   | `sort` | `sortOrder` | `&sort=most-liked` |

3. **History Management**:
   The hook uses `window.history.replaceState` instead of `pushState` to update the URL without cluttering the browser's back/forward history navigation stack.

4. **SSR Safety**:
   All DOM and window calls are guarded by `typeof window !== "undefined"` checks, ensuring clean server-side rendering in Next.js App Router.

---

## Extension Guide: Adding a New Filter Type

Follow these steps to add a new filter type (e.g., `"media-only"` or `"bookmarked"`):

### Step 1: Extend `FeedFilterType`
In `apps/web/src/hooks/useFeedState.ts`, add the new filter variant to the union:
```typescript
export type FeedFilterType =
  | "all"
  | "following"
  | "trending"
  | "recent"
  | "media-only"; // ← New filter
```

### Step 2: Extend `FeedFilter` with Optional Arguments
If your filter requires custom configuration values:
```typescript
export interface FeedFilter {
  type: FeedFilterType;
  minLikes?: number;
  author?: string;
  hasMedia?: boolean; // ← Custom filter parameter
}
```

### Step 3: Implement Filtering in `applyFilter()`
Add a `case` clause to the filter dispatcher:
```typescript
export function applyFilter(posts: Post[], filter: FeedFilter): Post[] {
  switch (filter.type) {
    // ...existing cases
    case "media-only":
      return posts.filter((post) => Boolean(post.imageUrl));
    default:
      return posts;
  }
}
```

### Step 4: Add URL Parameter Handling (Optional)
If the new filter should be shareable via URL:
- In `syncStateToUrl`:
  ```typescript
  if (filter.type === "media-only") params.set("filter", "media-only");
  ```
- In `readStateFromUrl`:
  ```typescript
  if (filterType === "media-only") {
    result.filter = { type: "media-only" };
  }
  ```

---

## Usage Examples

### Interactive Feed with Controls and URL Sync
```tsx
import { useFeedState } from "@/hooks/useFeedState";

export function FeedWithControls() {
  const {
    posts,
    loading,
    filter,
    setFilter,
    sortOrder,
    setSortOrder,
    refresh,
    loadMore,
    hasMore,
  } = useFeedState({
    initialFilter: { type: "trending", minLikes: 5 },
    initialSort: "most-liked",
    syncToUrl: true,
  });

  return (
    <div>
      <div className="filter-bar">
        <button
          className={filter.type === "all" ? "active" : ""}
          onClick={() => setFilter({ type: "all" })}
        >
          All
        </button>
        <button
          className={filter.type === "trending" ? "active" : ""}
          onClick={() => setFilter({ type: "trending", minLikes: 10 })}
        >
          Trending (>10 likes)
        </button>
        <button
          className={filter.type === "recent" ? "active" : ""}
          onClick={() => setFilter({ type: "recent" })}
        >
          Recent (24h)
        </button>
      </div>

      <div className="sort-bar">
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as any)}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="most-liked">Most Liked</option>
          <option value="most-tipped">Most Tipped</option>
        </select>
        <button onClick={refresh}>Refresh</button>
      </div>

      {loading && <p>Loading...</p>}

      <div className="posts">
        {posts.map((post) => (
          <div key={post.id} className="post-card">
            <p><strong>{post.author}</strong></p>
            <p>{post.content}</p>
            <span>❤️ {post.like_count ?? 0}</span>
            <span>💰 {post.tip_total ?? 0}</span>
          </div>
        ))}
      </div>

      {hasMore && (
        <button onClick={loadMore} className="load-more">
          Load More Posts
        </button>
      )}
    </div>
  );
}
```
