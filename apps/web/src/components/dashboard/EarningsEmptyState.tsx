"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

interface EarningsEmptyStateProps {
  /** Heading level: 2 (default) for standalone use, 3 when nested under an h2. */
  headingLevel?: 2 | 3;
}

/**
 * Empty state for the /creator/earnings page when the creator has no tips yet.
 *
 * Design-system consistency:
 * - Uses the same structural shape as PoolEmptyState (illustration + title + body + CTA).
 * - Reuses CSS custom-properties defined in globals.css (--color-*, --space-*, --radius-*).
 * - role="status" + aria-live="polite" so screen readers are notified when it appears.
 * - CTA links to /feed, matching the AC "Share your first post → feed".
 */
export function EarningsEmptyState({ headingLevel = 2 }: EarningsEmptyStateProps) {
  const H = headingLevel === 3 ? "h3" : "h2";

  return (
    <div
      style={styles.wrapper}
      role="status"
      aria-live="polite"
      data-testid="earnings-empty-state"
    >
      {/* Illustrated SVG — coins with an upward-trending arrow */}
      <div style={styles.illustration} aria-hidden="true">
        <EarningsIllustration />
      </div>

      <div style={styles.content}>
        <H style={styles.title}>No earnings yet</H>
        <p style={styles.body}>
          You haven&apos;t received any tips yet. Share great content and your supporters will be
          able to tip you directly on-chain.
        </p>
        <Link href="/feed" style={styles.cta} data-testid="earnings-empty-cta">
          Share your first post
        </Link>
      </div>
    </div>
  );
}

/* ── Inline SVG illustration ──────────────────────────────────────────────── */

function EarningsIllustration() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
    >
      {/* Background circle */}
      <circle
        cx="60"
        cy="60"
        r="56"
        fill="var(--color-surface-1)"
        stroke="var(--color-border)"
        strokeWidth="2"
      />

      {/* Coin stack — bottom */}
      <ellipse
        cx="60"
        cy="78"
        rx="22"
        ry="7"
        fill="var(--color-surface-2)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      <rect
        x="38"
        y="68"
        width="44"
        height="10"
        fill="var(--color-surface-2)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      <ellipse
        cx="60"
        cy="68"
        rx="22"
        ry="7"
        fill="var(--color-neutral-200)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />

      {/* Coin stack — middle */}
      <ellipse
        cx="60"
        cy="63"
        rx="22"
        ry="7"
        fill="var(--color-surface-2)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      <rect
        x="38"
        y="53"
        width="44"
        height="10"
        fill="var(--color-surface-2)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />
      <ellipse
        cx="60"
        cy="53"
        rx="22"
        ry="7"
        fill="var(--color-neutral-200)"
        stroke="var(--color-border)"
        strokeWidth="1.5"
      />

      {/* Coin — top (slightly smaller, more prominent) */}
      <ellipse
        cx="60"
        cy="48"
        rx="18"
        ry="6"
        fill="var(--color-primary-light)"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
      />
      <rect
        x="42"
        y="40"
        width="36"
        height="8"
        fill="var(--color-primary-light)"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
      />
      <ellipse
        cx="60"
        cy="40"
        rx="18"
        ry="6"
        fill="var(--color-primary-light)"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
      />
      {/* XLM symbol on top coin */}
      <text
        x="60"
        y="43"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="8"
        fontWeight="700"
        fill="var(--color-primary)"
        fontFamily="system-ui, sans-serif"
      >
        XLM
      </text>

      {/* Upward-trending arrow — top-right badge */}
      <circle cx="88" cy="34" r="14" fill="var(--color-primary)" />
      <path
        d="M82 40l6-12 6 12"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M84 34h8"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Styles (inline, matches PoolEmptyState pattern) ─────────────────────── */

const styles: Record<string, CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--space-lg, 24px)",
    padding: "var(--space-2xl, 48px) var(--space-md, 16px)",
    textAlign: "center",
  },
  illustration: {
    opacity: 0.9,
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--space-sm, 8px)",
    maxWidth: "360px",
  },
  title: {
    margin: 0,
    fontSize: "var(--text-xl, 1.25rem)",
    fontWeight: 600,
    color: "var(--color-text-primary)",
  },
  body: {
    margin: "4px 0 8px",
    fontSize: "var(--text-base, 1rem)",
    color: "var(--color-text-secondary)",
    lineHeight: 1.6,
  },
  cta: {
    marginTop: "var(--space-sm, 8px)",
    padding: "var(--space-sm, 8px) var(--space-lg, 24px)",
    background: "var(--color-primary, #7c3aed)",
    color: "white",
    borderRadius: "var(--radius-full, 9999px)",
    fontWeight: 600,
    fontSize: "var(--text-sm, 0.875rem)",
    textDecoration: "none",
    display: "inline-block",
    transition: "background 0.15s",
  },
};
