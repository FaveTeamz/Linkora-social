/**
 * @module feed
 *
 * Barrel export for all feed sub-components.
 *
 * Import from this file to avoid reaching deep into the directory structure:
 *
 * @example
 * ```tsx
 * import {
 *   FeedFilters,
 *   FeedInfiniteScroll,
 *   FeedSkeleton,
 *   FeedErrorBoundary,
 *   FeedContainer,
 * } from "@/components/feed";
 * ```
 */

export { FeedContainer } from "./FeedContainer";
export type { FeedContainerProps } from "./FeedContainer";

export { FeedFilters } from "./FeedFilters";
export type { FeedFiltersProps, FeedTab } from "./FeedFilters";

export { FeedInfiniteScroll } from "./FeedInfiniteScroll";
export type { FeedInfiniteScrollProps } from "./FeedInfiniteScroll";

export { FeedSkeleton } from "./FeedSkeleton";
export type { FeedSkeletonProps } from "./FeedSkeleton";

export { FeedErrorBoundary } from "./FeedErrorBoundary";
export type { FeedErrorBoundaryProps } from "./FeedErrorBoundary";
