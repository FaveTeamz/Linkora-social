"use client";

import React, { useCallback, useRef, useState } from "react";

interface CopyAddressButtonProps {
  /** The full Stellar address to copy. */
  address: string;
  /**
   * How long (in ms) the 'Copied!' tooltip stays visible.
   * @default 1500
   */
  feedbackDuration?: number;
}

/**
 * Renders a truncated Stellar address with a copy-to-clipboard button.
 *
 * Features:
 * - Copies the full address via the Clipboard API.
 * - Shows a 'Copied!' tooltip on success that auto-dismisses.
 * - Keyboard accessible: activates on Enter / Space.
 * - ARIA: announces copy result to screen readers via aria-live.
 * - No external dependencies.
 */
export function CopyAddressButton({
  address,
  feedbackDuration = 1500,
}: CopyAddressButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Truncate to first 6 + last 4 characters for compact display. */
  const truncated =
    address.length > 12
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : address;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), feedbackDuration);
    } catch {
      // Clipboard API unavailable — silently ignore.
    }
  }, [address, feedbackDuration]);

  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-sm text-[var(--text-muted)]"
      data-testid="copy-address-wrapper"
    >
      {/* Truncated address — visible text */}
      <span
        id="profile-address"
        title={address}
        aria-label={`Address: ${address}`}
      >
        {truncated}
      </span>

      {/* Copy button */}
      <span className="relative inline-flex items-center">
        <button
          type="button"
          onClick={handleCopy}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCopy();
            }
          }}
          aria-label="Copy address to clipboard"
          aria-pressed={copied}
          id="copy-address-btn"
          className={[
            "flex items-center justify-center w-7 h-7 rounded-md",
            "transition-colors focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[var(--accent-teal,#2dd4bf)]",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)]",
            copied
              ? "text-[var(--accent-teal,#2dd4bf)]"
              : "text-[var(--text-muted)] hover:text-[var(--accent-teal,#2dd4bf)]",
          ].join(" ")}
        >
          {copied ? (
            /* Checkmark icon */
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            /* Clipboard icon */
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="2" width="6" height="4" rx="1" ry="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            </svg>
          )}
        </button>

        {/* 'Copied!' tooltip */}
        {copied && (
          <span
            role="tooltip"
            aria-live="assertive"
            aria-atomic="true"
            className={[
              "absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5",
              "whitespace-nowrap rounded-md px-2 py-0.5",
              "bg-[var(--accent-teal,#2dd4bf)] text-[#0B1120]",
              "text-xs font-semibold pointer-events-none",
              "animate-fade-in",
            ].join(" ")}
          >
            Copied!
          </span>
        )}
      </span>

      {/* Hidden live region for screen-reader announcement */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {copied ? "Address copied to clipboard." : ""}
      </span>
    </span>
  );
}
