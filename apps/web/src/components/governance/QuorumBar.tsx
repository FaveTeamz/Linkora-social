/**
 * QuorumBar — reusable segmented progress bar for governance proposal votes.
 *
 * Displays a green/red split bar representing votes-for vs votes-against,
 * with a quorum threshold marker. Animates the fill widths on mount using a
 * CSS transition so the bar "grows in" visually when first rendered.
 *
 * Accessibility: the bar carries role="progressbar" with aria-valuenow,
 * aria-valuemin, and aria-valuemax set to the total vote percentage, plus
 * a descriptive aria-label so screen readers can announce vote counts.
 *
 * Design tokens from globals.css are used exclusively — no hard-coded
 * Tailwind colour utilities — so the bar adapts to light/dark theme.
 *
 * @example
 * ```tsx
 * <QuorumBar votesFor={3200n} votesAgainst={800n} quorum={2000} />
 * ```
 */

"use client";

import React, { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuorumBarProps {
  /**
   * Total votes cast in favour of the proposal.
   * Accepts a `bigint` (direct from the SDK) or a `number`.
   */
  votesFor: bigint | number;

  /**
   * Total votes cast against the proposal.
   * Accepts a `bigint` (direct from the SDK) or a `number`.
   */
  votesAgainst: bigint | number;

  /**
   * The minimum total votes required for quorum to be reached.
   * When > 0, a threshold marker is rendered on the bar.
   * Accepts a `bigint` or a `number`.
   */
  quorum: bigint | number;

  /** Additional class names applied to the outermost wrapper. */
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Safely converts bigint | number to a JS number for math. */
function toNum(v: bigint | number): number {
  return typeof v === "bigint" ? Number(v) : v;
}

/** Clamp a value between [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Segmented quorum progress bar for a governance proposal.
 *
 * The bar is split into three regions:
 *  - Green segment — proportion of votes cast *for* the proposal.
 *  - Red segment   — proportion of votes cast *against* the proposal.
 *  - Empty segment — remaining votes needed before quorum is reached.
 *
 * A dashed threshold marker is rendered at the quorum position when
 * `quorum` is non-zero.
 */
export function QuorumBar({
  votesFor,
  votesAgainst,
  quorum,
  className,
}: QuorumBarProps): React.JSX.Element {
  const numFor = toNum(votesFor);
  const numAgainst = toNum(votesAgainst);
  const numQuorum = toNum(quorum);

  const totalVotes = numFor + numAgainst;
  // The bar denominator is the larger of total votes and quorum (so the bar
  // fills completely when quorum is exceeded, and shows remaining space when
  // quorum has not yet been reached).
  const barMax = Math.max(totalVotes, numQuorum, 1);

  // Percentages relative to barMax (clamped to [0, 100])
  const pctFor = clamp((numFor / barMax) * 100, 0, 100);
  const pctAgainst = clamp((numAgainst / barMax) * 100, 0, 100);
  const pctQuorum = numQuorum > 0 ? clamp((numQuorum / barMax) * 100, 0, 100) : null;

  // Total participation expressed as a value from 0–100 for aria-valuenow
  const pctParticipation = clamp((totalVotes / barMax) * 100, 0, 100);

  // Animate fill on mount: start at 0%, transition to computed widths
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Defer one paint so the transition fires (avoids initial-render skip)
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const forWidth = mounted ? `${pctFor}%` : "0%";
  const againstWidth = mounted ? `${pctAgainst}%` : "0%";

  const quorumMet = numQuorum > 0 && totalVotes >= numQuorum;

  const ariaLabel = [
    `Votes for: ${numFor.toLocaleString()}`,
    `Votes against: ${numAgainst.toLocaleString()}`,
    numQuorum > 0
      ? `Quorum: ${numQuorum.toLocaleString()} (${quorumMet ? "reached" : "not yet reached"})`
      : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div className={className}>
      {/* ── Segmented bar ──────────────────────────────────────────────── */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pctParticipation)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
        style={{
          position: "relative",
          height: "8px",
          borderRadius: "9999px",
          overflow: "visible",
          background: "var(--muted)",
          display: "flex",
          alignItems: "stretch",
        }}
      >
        {/* Green "for" segment */}
        <div
          aria-hidden="true"
          style={{
            width: forWidth,
            minWidth: numFor > 0 ? "4px" : "0",
            background: "var(--color-success)",
            borderRadius: pctAgainst === 0 ? "9999px" : "9999px 0 0 9999px",
            transition: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)",
            flexShrink: 0,
          }}
        />

        {/* Red "against" segment */}
        <div
          aria-hidden="true"
          style={{
            width: againstWidth,
            minWidth: numAgainst > 0 ? "4px" : "0",
            background: "var(--color-error)",
            borderRadius:
              pctFor === 0 ? "9999px" : "0 9999px 9999px 0",
            transition: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)",
            flexShrink: 0,
          }}
        />

        {/* Quorum threshold marker */}
        {pctQuorum !== null && (
          <div
            aria-hidden="true"
            title={`Quorum threshold: ${numQuorum.toLocaleString()} votes`}
            style={{
              position: "absolute",
              top: "-4px",
              left: `${pctQuorum}%`,
              transform: "translateX(-50%)",
              width: "2px",
              height: "16px",
              background: quorumMet
                ? "var(--color-success)"
                : "var(--color-text-secondary, var(--text-muted))",
              borderRadius: "1px",
              opacity: 0.85,
              transition: "background 300ms ease",
            }}
          />
        )}
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "6px",
          fontSize: "0.6875rem",
          color: "var(--text-muted)",
          gap: "8px",
        }}
      >
        {/* For count */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--color-success)",
            fontWeight: 600,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--color-success)",
              flexShrink: 0,
            }}
          />
          For: {numFor.toLocaleString()}
        </span>

        {/* Quorum status */}
        {numQuorum > 0 && (
          <span
            style={{
              color: quorumMet ? "var(--color-success)" : "var(--text-muted)",
              fontWeight: quorumMet ? 600 : 400,
              transition: "color 300ms ease",
            }}
          >
            {quorumMet ? "✓ Quorum reached" : `Quorum: ${numQuorum.toLocaleString()}`}
          </span>
        )}

        {/* Against count */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--color-error)",
            fontWeight: 600,
          }}
        >
          Against: {numAgainst.toLocaleString()}
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--color-error)",
              flexShrink: 0,
            }}
          />
        </span>
      </div>
    </div>
  );
}

export default QuorumBar;
