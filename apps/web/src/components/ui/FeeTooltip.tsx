"use client";

import React, { useState, useRef, useId } from "react";

interface FeeTooltipProps {
  /** Protocol fee in basis points (e.g. 100 = 1 %). */
  feeBps?: number;
  /** Extra class names applied to the wrapper span. */
  className?: string;
}

/**
 * FeeTooltip
 *
 * Renders a small ⓘ info icon next to an amount label.  On hover or
 * keyboard-focus the icon reveals a tooltip that explains the platform-fee
 * split, e.g. "Platform fee: 1%, Creator receives: 99%".
 *
 * - Keyboard accessible: focusable via Tab; tooltip appears on focus.
 * - Screen-reader accessible: uses role="tooltip" + aria-describedby.
 * - Colours come entirely from CSS custom properties (design tokens).
 * - No extra dependencies beyond React.
 */
export function FeeTooltip({ feeBps = 100, className = "" }: FeeTooltipProps) {
  const [visible, setVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  const feePercent = feeBps / 100;
  const creatorPercent = 100 - feePercent;

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  return (
    <span
      style={styles.wrapper}
      className={className}
      // Allow the wrapper to be non-interactive — only the button triggers.
    >
      {/* Trigger button */}
      <button
        ref={buttonRef}
        type="button"
        aria-label="Fee information"
        aria-describedby={visible ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={styles.trigger}
      >
        ⓘ
      </button>

      {/* Tooltip bubble */}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          style={styles.tooltip}
          // Prevent the tooltip itself from stealing mouse-leave from the button.
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <span style={styles.row}>
            <span style={styles.dot} aria-hidden="true">
              ●
            </span>
            Platform fee:&nbsp;
            <strong style={styles.highlight}>{feePercent}%</strong>
          </span>
          <span style={styles.row}>
            <span style={styles.dot} aria-hidden="true">
              ●
            </span>
            Creator receives:&nbsp;
            <strong style={styles.highlight}>{creatorPercent}%</strong>
          </span>
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Styles — all colours reference CSS custom properties from design tokens so
// they automatically adapt to light / dark themes.
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    verticalAlign: "middle",
  },

  trigger: {
    /* Reset */
    all: "unset",
    /* Layout */
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.25rem",
    height: "1.25rem",
    /* Visual */
    color: "var(--color-primary)",
    fontSize: "var(--text-sm, 0.875rem)",
    lineHeight: 1,
    cursor: "pointer",
    borderRadius: "var(--radius-full, 9999px)",
    transition: "color 0.15s, box-shadow 0.15s",
    /* Make it keyboard-focusable */
    tabIndex: 0,
  } as React.CSSProperties,

  tooltip: {
    position: "absolute",
    /* Sit above and centred on the trigger */
    bottom: "calc(100% + 0.5rem)",
    left: "50%",
    transform: "translateX(-50%)",
    /* Sizing */
    width: "max-content",
    maxWidth: "220px",
    /* Visual */
    background: "var(--color-neutral-800, #1F2937)",
    color: "var(--color-text-inverse, #FFFFFF)",
    border: "1px solid var(--color-border, #E5E7EB)",
    borderRadius: "var(--radius-md, 0.5rem)",
    padding: "0.5rem 0.75rem",
    /* Typography */
    fontSize: "var(--text-xs, 0.75rem)",
    fontFamily: "var(--font-sans, sans-serif)",
    lineHeight: "var(--leading-normal, 1.5)",
    /* Stack order */
    zIndex: 9999,
    /* Layout */
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    /* Animation */
    animation: "fadeInTooltip 0.12s ease-out",
    /* Prevent wrapping at odd sizes */
    whiteSpace: "nowrap",
    /* Pointer */
    pointerEvents: "auto",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },

  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
  },

  dot: {
    fontSize: "0.4rem",
    color: "var(--color-primary, #7C3AED)",
    lineHeight: 1,
  },

  highlight: {
    color: "var(--color-secondary, #06B6D4)",
    fontWeight: 700,
  },
};
