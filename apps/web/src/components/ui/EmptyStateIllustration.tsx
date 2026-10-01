/**
 * EmptyStateIllustration — SVG illustrations for empty page states.
 *
 * Each variant is consistent with the Linkora brand colour palette
 * (primary #7C3AED, secondary #06B6D4, accent #F59E0B) defined in
 * docs/design/tokens.css.
 *
 * Dark mode is handled via CSS custom properties; no additional dark-mode
 * variant components are required — the browser substitutes the correct token
 * values automatically when `[data-theme="dark"]` is set.
 *
 * All illustrations include descriptive `aria-label` for accessibility and
 * `role="img"` so screen readers correctly identify them as images.
 *
 * Issue #173 — Add empty state illustrations for new pages.
 */

import React from "react";

// ── Shared palette — maps to CSS tokens so colours flip in dark mode ─────────
// We inline static brand colours for the SVG paths themselves (they read
// well in both modes) but use CSS vars for surfaces & borders.

const PRIMARY = "#7C3AED";
const SECONDARY = "#06B6D4";
const ACCENT = "#F59E0B";
const NEUTRAL_LIGHT = "#EDE9FE"; // primary-light
const NEUTRAL_BG = "var(--muted)";
const STROKE_COLOR = "var(--color-border)";

// ── Governance empty state ────────────────────────────────────────────────────

export function GovernanceEmptyIllustration() {
  return (
    <svg
      width="160"
      height="140"
      viewBox="0 0 160 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="No governance proposals yet — illustrated ballot box with a star"
    >
      {/* Podium base */}
      <rect x="20" y="100" width="120" height="12" rx="4" fill={NEUTRAL_LIGHT} opacity="0.5" />
      {/* Ballot box body */}
      <rect x="45" y="50" width="70" height="52" rx="6" fill={NEUTRAL_LIGHT} stroke={PRIMARY} strokeWidth="2" />
      {/* Ballot slot on top */}
      <rect x="68" y="44" width="24" height="10" rx="3" fill={PRIMARY} opacity="0.85" />
      {/* Decorative lines — ballot paper */}
      <line x1="58" y1="70" x2="102" y2="70" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" />
      <line x1="58" y1="80" x2="88" y2="80" stroke={SECONDARY} strokeWidth="2" strokeLinecap="round" />
      {/* Check mark inside box */}
      <path
        d="M62 91 L70 99 L98 75"
        stroke={SECONDARY}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Star accent top-right */}
      <path
        d="M122 28 L124.4 34.6 L131.5 34.6 L125.9 38.8 L128.3 45.4 L122 41.4 L115.7 45.4 L118.1 38.8 L112.5 34.6 L119.6 34.6 Z"
        fill={ACCENT}
        opacity="0.9"
      />
      {/* Small orbit dots */}
      <circle cx="32" cy="68" r="4" fill={SECONDARY} opacity="0.5" />
      <circle cx="138" cy="80" r="3" fill={PRIMARY} opacity="0.4" />
      <circle cx="28" cy="90" r="2.5" fill={ACCENT} opacity="0.6" />
    </svg>
  );
}

// ── Creator empty state ───────────────────────────────────────────────────────

export function CreatorEmptyIllustration() {
  return (
    <svg
      width="160"
      height="140"
      viewBox="0 0 160 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="No creator content yet — illustrated pencil and canvas"
    >
      {/* Canvas / card */}
      <rect x="30" y="28" width="100" height="76" rx="8" fill={NEUTRAL_LIGHT} stroke={PRIMARY} strokeWidth="2" />
      {/* Horizontal lines (content placeholder) */}
      <line x1="46" y1="52" x2="114" y2="52" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" />
      <line x1="46" y1="62" x2="100" y2="62" stroke={SECONDARY} strokeWidth="2" strokeLinecap="round" />
      <line x1="46" y1="72" x2="90" y2="72" stroke={SECONDARY} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      {/* Pencil — body */}
      <rect
        x="97"
        y="78"
        width="12"
        height="36"
        rx="2"
        fill={ACCENT}
        transform="rotate(-35 97 78)"
      />
      {/* Pencil tip */}
      <path
        d="M108.5 100.5 L103 106 L115 109 Z"
        fill={PRIMARY}
        opacity="0.8"
      />
      {/* Sparkles */}
      <circle cx="40" cy="38" r="3" fill={ACCENT} opacity="0.7" />
      <circle cx="126" cy="34" r="4" fill={SECONDARY} opacity="0.6" />
      <circle cx="135" cy="95" r="2.5" fill={PRIMARY} opacity="0.45" />
      {/* Ground shadow */}
      <ellipse cx="80" cy="114" rx="46" ry="5" fill={PRIMARY} opacity="0.08" />
    </svg>
  );
}

// ── Notifications empty state ─────────────────────────────────────────────────

export function NotificationsEmptyIllustration() {
  return (
    <svg
      width="160"
      height="140"
      viewBox="0 0 160 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="No notifications yet — illustrated bell with zzz"
    >
      {/* Bell body */}
      <path
        d="M80 24 C58 24 46 42 46 62 L46 84 L34 94 L126 94 L114 84 L114 62 C114 42 102 24 80 24 Z"
        fill={NEUTRAL_LIGHT}
        stroke={PRIMARY}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Bell clapper */}
      <circle cx="80" cy="102" r="8" fill={NEUTRAL_LIGHT} stroke={PRIMARY} strokeWidth="2" />
      {/* Interior highlight arc */}
      <path
        d="M60 60 Q62 50 72 46"
        stroke={SECONDARY}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      {/* Zzz letters — sleeping bell */}
      <text
        x="100"
        y="55"
        fontSize="12"
        fontWeight="700"
        fill={ACCENT}
        opacity="0.85"
        fontFamily="system-ui, sans-serif"
      >
        z
      </text>
      <text
        x="110"
        y="44"
        fontSize="10"
        fontWeight="700"
        fill={ACCENT}
        opacity="0.65"
        fontFamily="system-ui, sans-serif"
      >
        z
      </text>
      <text
        x="118"
        y="35"
        fontSize="8"
        fontWeight="700"
        fill={ACCENT}
        opacity="0.45"
        fontFamily="system-ui, sans-serif"
      >
        z
      </text>
      {/* Ground shadow */}
      <ellipse cx="80" cy="118" rx="40" ry="5" fill={PRIMARY} opacity="0.08" />
    </svg>
  );
}

// ── Generic wrapper used in pages ─────────────────────────────────────────────

export type EmptyStateVariant = "governance" | "creator" | "notifications";

interface EmptyStateIllustrationProps {
  variant: EmptyStateVariant;
  title: string;
  description: string;
  /** Optional CTA rendered below the description */
  children?: React.ReactNode;
}

const illustrationMap: Record<EmptyStateVariant, React.FC> = {
  governance: GovernanceEmptyIllustration,
  creator: CreatorEmptyIllustration,
  notifications: NotificationsEmptyIllustration,
};

/**
 * `EmptyStateIllustration` is a composable empty-state block used by the
 * governance, creator, and notifications pages. It renders the appropriate
 * brand SVG illustration above a title + description.
 *
 * Dark / light mode is fully handled by CSS custom properties — no conditional
 * class logic is needed in the consuming page.
 */
export function EmptyStateIllustration({
  variant,
  title,
  description,
  children,
}: EmptyStateIllustrationProps) {
  const Illustration = illustrationMap[variant];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "3rem 1.5rem",
        borderRadius: "1rem",
        border: `1px solid ${STROKE_COLOR}`,
        backgroundColor: NEUTRAL_BG,
        gap: "1rem",
      }}
      role="region"
      aria-label={`Empty state: ${title}`}
    >
      <Illustration />

      <div style={{ maxWidth: "320px" }}>
        <h3
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--foreground)",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "0.9rem",
            color: "var(--text-muted)",
            lineHeight: 1.55,
          }}
        >
          {description}
        </p>
      </div>

      {children && <div style={{ marginTop: "0.5rem" }}>{children}</div>}
    </div>
  );
}
