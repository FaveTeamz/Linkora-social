/**
 * ProposalStatus — reusable badge component for governance proposal status.
 *
 * Uses CSS custom-property design tokens from globals.css so the colours
 * automatically adapt to light/dark themes without hard-coded Tailwind
 * colour utilities.
 *
 * Accessibility: the badge carries role="status" and an aria-label so that
 * screen readers announce the proposal state even when only an icon is shown.
 */

import React from "react";
import { GovStatus } from "linkora-sdk";

// ── Token-mapped style config ────────────────────────────────────────────────

interface StatusConfig {
  /** Human-readable label displayed inside the badge. */
  label: string;
  /** Inline style values that reference CSS custom properties. */
  style: React.CSSProperties;
}

/**
 * Map each GovStatus variant to a distinct visual treatment.
 *
 * Colours come exclusively from the design-token CSS custom properties
 * defined in globals.css (--color-*) so they honour the active theme.
 */
const STATUS_CONFIG: Record<GovStatus, StatusConfig> = {
  [GovStatus.Active]: {
    label: "Active",
    style: {
      backgroundColor: "color-mix(in srgb, var(--color-info) 15%, transparent)",
      color: "var(--color-info)",
      borderColor: "color-mix(in srgb, var(--color-info) 40%, transparent)",
    },
  },
  [GovStatus.Passed]: {
    label: "Passed",
    style: {
      backgroundColor: "color-mix(in srgb, var(--color-success) 15%, transparent)",
      color: "var(--color-success)",
      borderColor: "color-mix(in srgb, var(--color-success) 40%, transparent)",
    },
  },
  [GovStatus.Executed]: {
    label: "Executed",
    style: {
      backgroundColor: "color-mix(in srgb, var(--color-primary) 15%, transparent)",
      color: "var(--color-primary)",
      borderColor: "color-mix(in srgb, var(--color-primary) 40%, transparent)",
    },
  },
  [GovStatus.Vetoed]: {
    label: "Vetoed",
    style: {
      backgroundColor: "color-mix(in srgb, var(--color-warning) 15%, transparent)",
      color: "var(--color-accent)",
      borderColor: "color-mix(in srgb, var(--color-warning) 40%, transparent)",
    },
  },
  [GovStatus.Failed]: {
    label: "Failed",
    style: {
      backgroundColor: "color-mix(in srgb, var(--color-error) 15%, transparent)",
      color: "var(--color-error)",
      borderColor: "color-mix(in srgb, var(--color-error) 40%, transparent)",
    },
  },
};

// ── Component props ──────────────────────────────────────────────────────────

export interface ProposalStatusProps {
  /** The governance proposal status to display. */
  status: GovStatus;
  /**
   * Controls the badge size.
   * @default "md"
   */
  size?: "sm" | "md" | "lg";
  /** Additional class names for the host element. */
  className?: string;
}

// ── Size variants ────────────────────────────────────────────────────────────

const SIZE_STYLES: Record<NonNullable<ProposalStatusProps["size"]>, React.CSSProperties> = {
  sm: { fontSize: "0.6875rem", padding: "1px 6px" },
  md: { fontSize: "0.75rem", padding: "2px 10px" },
  lg: { fontSize: "0.875rem", padding: "4px 14px" },
};

// ── ProposalStatus ───────────────────────────────────────────────────────────

/**
 * Renders a pill-shaped badge that communicates the status of a governance
 * proposal.  All five GovStatus variants are supported.
 *
 * @example
 * ```tsx
 * <ProposalStatus status={GovStatus.Active} />
 * <ProposalStatus status={GovStatus.Passed} size="sm" />
 * ```
 */
export function ProposalStatus({
  status,
  size = "md",
  className,
}: ProposalStatusProps): React.JSX.Element {
  const config = STATUS_CONFIG[status];

  const combinedStyle: React.CSSProperties = {
    ...config.style,
    ...SIZE_STYLES[size],
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontWeight: 600,
    borderRadius: "9999px",
    border: "1px solid",
    letterSpacing: "0.025em",
    whiteSpace: "nowrap",
    lineHeight: 1.4,
    userSelect: "none",
  };

  return (
    <span
      role="status"
      aria-label={`Proposal status: ${config.label}`}
      style={combinedStyle}
      className={className}
      data-testid={`proposal-status-${status.toLowerCase()}`}
    >
      {/* Decorative dot — aria-hidden so screen readers rely on the label */}
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: "currentColor",
          flexShrink: 0,
        }}
      />
      {config.label}
    </span>
  );
}

export default ProposalStatus;
