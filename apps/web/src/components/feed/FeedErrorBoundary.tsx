/**
 * @module FeedErrorBoundary
 *
 * A React **class-based Error Boundary** that catches unhandled render errors
 * thrown anywhere in the feed subtree and displays a user-friendly recovery
 * UI in place of the crashed component tree.
 *
 * Use this component to wrap the feed column (or any large async section) so
 * that a single bad post or a data-fetching race condition cannot blank the
 * entire page.
 *
 * Pairs well with {@link FeedSkeleton} (shown before data arrives) and
 * {@link FeedInfiniteScroll} (appends pages). All three are in
 * `apps/web/src/components/feed/`.
 *
 * @example
 * ```tsx
 * import { FeedErrorBoundary } from "@/components/feed/FeedErrorBoundary";
 * import { FeedInfiniteScroll } from "@/components/feed/FeedInfiniteScroll";
 *
 * export function FeedColumn() {
 *   return (
 *     <FeedErrorBoundary onReset={() => window.location.reload()}>
 *       <PostList />
 *       <FeedInfiniteScroll hasMore={hasMore} loading={loading} onLoadMore={load} />
 *     </FeedErrorBoundary>
 *   );
 * }
 * ```
 */

"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";

// ─── Props interface ──────────────────────────────────────────────────────────

/**
 * Props for the {@link FeedErrorBoundary} component.
 */
export interface FeedErrorBoundaryProps {
  /**
   * The subtree to protect. Errors thrown during rendering, in lifecycle
   * methods, or in constructors of any descendant component will be caught
   * here instead of propagating to the root.
   */
  children: ReactNode;

  /**
   * Optional callback invoked when the user clicks the **"Try again"**
   * recovery button.
   *
   * Use this to re-fetch feed data, clear caches, or navigate. If omitted,
   * clicking "Try again" only resets the error boundary's internal state —
   * which will re-render the children and may immediately re-throw if the
   * underlying cause has not been resolved.
   */
  onReset?: () => void;

  /**
   * Custom error fallback UI to render instead of the built-in message.
   *
   * Receives the caught `error` and a `reset` callback so you can build
   * richer recovery flows (e.g. error code display, reporting links).
   *
   * @param error - The JavaScript `Error` object that was thrown.
   * @param reset - Call this to clear the error boundary state and re-render children.
   *
   * @example
   * ```tsx
   * <FeedErrorBoundary
   *   fallback={(error, reset) => (
   *     <div>
   *       <p>Something went wrong: {error.message}</p>
   *       <button onClick={reset}>Retry</button>
   *     </div>
   *   )}
   * />
   * ```
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

// ─── State interface ──────────────────────────────────────────────────────────

/**
 * Internal state of {@link FeedErrorBoundary}.
 */
interface FeedErrorBoundaryState {
  /** The last caught error, or `null` when the boundary is healthy. */
  error: Error | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * React Error Boundary for the Linkora feed column.
 *
 * Catches render-time errors thrown by any descendant and replaces the
 * broken subtree with a recovery UI. The built-in fallback shows a short
 * message and a **"Try again"** button. Supply a `fallback` render prop
 * to replace it with custom UI.
 *
 * **Limitations** (React Error Boundary constraints):
 * - Does **not** catch errors in event handlers — use `try/catch` there.
 * - Does **not** catch errors in asynchronous code (e.g. `setTimeout`, Promises).
 * - Does **not** catch errors in the boundary component itself.
 *
 * @param props - {@link FeedErrorBoundaryProps}
 *
 * @example
 * ```tsx
 * // Minimal usage — default built-in recovery UI
 * <FeedErrorBoundary>
 *   <PostList />
 * </FeedErrorBoundary>
 *
 * // With custom fallback
 * <FeedErrorBoundary
 *   fallback={(err, reset) => <p>{err.message} — <button onClick={reset}>retry</button></p>}
 * >
 *   <PostList />
 * </FeedErrorBoundary>
 * ```
 */
export class FeedErrorBoundary extends Component<
  FeedErrorBoundaryProps,
  FeedErrorBoundaryState
> {
  constructor(props: FeedErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  /** React lifecycle: populate state from caught error. */
  static getDerivedStateFromError(error: Error): FeedErrorBoundaryState {
    return { error };
  }

  /**
   * React lifecycle: called after an error has been caught.
   *
   * Logs the error to the browser console. In a production app you might
   * forward this to an error-reporting service (Sentry, Datadog, etc.).
   *
   * @param error - The thrown error.
   * @param info - React component stack at the time of the error.
   */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[FeedErrorBoundary] Caught render error:", error, info.componentStack);
  }

  /**
   * Resets the boundary to its healthy state and calls `props.onReset`
   * if provided.
   *
   * Bound to `this` in the constructor so it can be passed directly as an
   * event handler without wrapping in an arrow function.
   */
  handleReset(): void {
    this.setState({ error: null });
    this.props.onReset?.();
  }

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;

    // Custom fallback render prop
    if (fallback) return fallback(error, this.handleReset);

    // Built-in fallback UI
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-800 bg-red-950/40 p-6 text-center text-sm text-red-200 space-y-3"
      >
        <p className="font-semibold text-base">Something went wrong loading the feed.</p>
        <p className="text-red-300/80 text-xs">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-2 inline-block rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}

export default FeedErrorBoundary;
