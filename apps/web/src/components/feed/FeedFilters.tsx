/**
 * @module FeedFilters
 *
 * Renders the tab-based filter bar that lets users switch between the
 * **Explore** (all posts) and **Following** (posts from followed accounts)
 * feed views.
 *
 * The component is intentionally stateless — it receives the current active
 * tab and a change handler from its parent so the parent can drive data
 * fetching, URL state, or persistence.
 *
 * @example
 * ```tsx
 * import { FeedFilters, type FeedTab } from "@/components/feed/FeedFilters";
 *
 * export default function FeedPage() {
 *   const [activeTab, setActiveTab] = React.useState<FeedTab>("explore");
 *
 *   return (
 *     <>
 *       <FeedFilters activeTab={activeTab} onTabChange={setActiveTab} />
 *       <FeedList tab={activeTab} />
 *     </>
 *   );
 * }
 * ```
 */

"use client";

import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The set of top-level feed views the user can switch between.
 *
 * | Value       | Description                                      |
 * |-------------|--------------------------------------------------|
 * | `"explore"` | Shows all public posts, newest first.            |
 * | `"following"` | Shows posts from accounts the viewer follows.  |
 */
export type FeedTab = "explore" | "following";

// ─── Props interface ──────────────────────────────────────────────────────────

/**
 * Props for the {@link FeedFilters} component.
 */
export interface FeedFiltersProps {
  /**
   * The currently active feed tab.
   *
   * Drives the visual highlight on the selected tab button and determines
   * which dataset the parent should load.
   */
  activeTab: FeedTab;

  /**
   * Callback invoked when the user selects a different tab.
   *
   * The parent is responsible for updating state and triggering a new data
   * fetch. The callback receives the newly selected {@link FeedTab}.
   *
   * @param tab - The tab the user clicked.
   */
  onTabChange: (tab: FeedTab) => void;

  /**
   * Optional CSS class applied to the wrapping `<nav>` element.
   *
   * Use this to override layout or spacing from the parent without altering
   * the component internals.
   *
   * @defaultValue `undefined`
   */
  className?: string;
}

// ─── Tab definition ───────────────────────────────────────────────────────────

/** Ordered list of tabs rendered by {@link FeedFilters}. */
const TABS: { id: FeedTab; label: string }[] = [
  { id: "explore", label: "Explore" },
  { id: "following", label: "Following" },
];

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Tab-based filter bar for the Linkora feed.
 *
 * Renders a horizontal list of tab buttons (Explore / Following). The active
 * tab is highlighted with a violet underline accent. Switching tabs calls
 * `onTabChange` so the parent can update its feed query.
 *
 * **Accessibility**: each button has an `aria-selected` attribute and the
 * wrapping element uses `role="tablist"` so screen readers announce the
 * current selection correctly.
 *
 * @param props - {@link FeedFiltersProps}
 *
 * @example
 * ```tsx
 * <FeedFilters activeTab="explore" onTabChange={(tab) => console.log(tab)} />
 * ```
 */
export function FeedFilters({ activeTab, onTabChange, className }: FeedFiltersProps) {
  return (
    <nav
      className={`border-b border-[var(--border)] ${className ?? ""}`}
      aria-label="Feed filters"
    >
      <div role="tablist" className="flex gap-6">
        {TABS.map(({ id, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(id)}
              className={`pb-3 text-base font-semibold transition-all relative ${
                isActive
                  ? "text-[var(--foreground)]"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default FeedFilters;
