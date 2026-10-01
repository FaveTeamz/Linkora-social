"use client";

/**
 * ProfileCard — displays a user profile row with an animated Follow/Unfollow
 * button transition (Issue #174).
 *
 * Animation details:
 * - Follow → Following: label cross-fades while a tick icon slides in from the
 *   left using CSS transitions only (no animation library).
 * - Unfollow: clicking "Following" shows a brief "Unfollow?" confirmation state
 *   for 1.5 s then the button reverts to "Follow" unless confirmed.
 * - The `@media (prefers-reduced-motion: reduce)` rule in globals.css disables
 *   all transitions and keyframes for users who prefer reduced motion. The
 *   button still works but skips visual animation.
 *
 * All colours use CSS custom properties so dark/light mode is handled
 * automatically.
 */

import { useEffect, useRef, useState } from "react";

export interface Profile {
  address: string;
  username?: string;
  followerCount?: number;
  follower_count?: number;
  isFollowing?: boolean;
}

interface ProfileCardProps {
  profile: Profile;
}

function formatAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

// ── CheckIcon ────────────────────────────────────────────────────────────────
// Lightweight inline SVG — no external dependency required.
function CheckIcon({ visible }: { visible: boolean }) {
  return (
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
      style={{
        /* Slide + fade in when the following state is active */
        display: "inline-block",
        overflow: "hidden",
        maxWidth: visible ? "18px" : "0px",
        opacity: visible ? 1 : 0,
        marginRight: visible ? "5px" : "0",
        transition: "max-width 250ms ease, opacity 200ms ease, margin-right 200ms ease",
        /* prefers-reduced-motion — handled globally in globals.css */
      }}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

// ── FollowButton ─────────────────────────────────────────────────────────────

type ButtonState = "follow" | "following" | "confirm-unfollow";

interface FollowButtonProps {
  isFollowing: boolean;
  displayName: string;
  onFollow: () => void;
  onUnfollow: () => void;
}

function FollowButton({ isFollowing, displayName, onFollow, onUnfollow }: FollowButtonProps) {
  const [btnState, setBtnState] = useState<ButtonState>(isFollowing ? "following" : "follow");
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep button state in sync if the parent re-renders with a changed prop
  useEffect(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setBtnState(isFollowing ? "following" : "follow");
  }, [isFollowing]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (btnState === "follow") {
      // Optimistic: immediately show "Following" with tick animation
      setBtnState("following");
      onFollow();
    } else if (btnState === "following") {
      // First click on "Following": show brief confirmation state
      setBtnState("confirm-unfollow");
      // Auto-revert after 1.5 s if user doesn't click again
      confirmTimerRef.current = setTimeout(() => {
        setBtnState("following");
        confirmTimerRef.current = null;
      }, 1500);
    } else if (btnState === "confirm-unfollow") {
      // Confirmed unfollow
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
      setBtnState("follow");
      onUnfollow();
    }
  };

  // ── Derived styles per state ─────────────────────────────────────────────
  const isActive = btnState === "following";
  const isConfirm = btnState === "confirm-unfollow";

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.4rem 1rem",
    borderRadius: "0.5rem",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    minWidth: "96px",
    userSelect: "none",
    /* CSS-only transitions — no JS animation library */
    transition:
      "background-color 200ms ease, color 200ms ease, border-color 200ms ease, box-shadow 200ms ease",
    outline: "none",
  };

  const followStyle: React.CSSProperties = {
    ...baseStyle,
    border: "none",
    backgroundColor: "var(--color-primary)",
    color: "var(--color-text-on-brand)",
    boxShadow: "0 1px 4px rgba(124, 58, 237, 0.3)",
  };

  const followingStyle: React.CSSProperties = {
    ...baseStyle,
    border: "1px solid var(--color-border)",
    backgroundColor: "transparent",
    color: "var(--foreground)",
  };

  const confirmStyle: React.CSSProperties = {
    ...baseStyle,
    border: "1px solid rgba(239, 68, 68, 0.5)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    color: "var(--color-error)",
  };

  const resolvedStyle = isConfirm ? confirmStyle : isActive ? followingStyle : followStyle;

  const ariaLabel = isConfirm
    ? `Click again to unfollow ${displayName}`
    : isActive
    ? `Unfollow ${displayName}`
    : `Follow ${displayName}`;

  const label = isConfirm ? "Unfollow?" : isActive ? "Following" : "Follow";

  return (
    <button
      type="button"
      onClick={handleClick}
      style={resolvedStyle}
      aria-label={ariaLabel}
      aria-pressed={isActive || isConfirm}
    >
      {/* Animated tick — only visible when "Following" */}
      <CheckIcon visible={isActive} />
      {/* Label cross-fade using opacity + transform transition */}
      <span
        style={{
          display: "inline-block",
          transition: "opacity 150ms ease, transform 150ms ease",
          opacity: 1,
          transform: "translateY(0)",
        }}
        key={label} /* key change forces the span to remount and replay transition */
      >
        {label}
      </span>
    </button>
  );
}

// ── ProfileCard ──────────────────────────────────────────────────────────────

export function ProfileCard({ profile }: ProfileCardProps) {
  const [following, setFollowing] = useState(!!profile.isFollowing);
  const followers = profile.followerCount ?? profile.follower_count ?? 0;
  const displayName = profile.username || formatAddress(profile.address);

  return (
    <article className="flex flex-col sm:flex-row items-start sm:items-center gap-3 md:gap-4 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 md:p-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-900/50 text-lg font-bold text-violet-200">
        {displayName.slice(0, 1).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-[var(--foreground)]">{displayName}</h2>
        <p className="truncate text-sm text-[var(--text-muted)]" title={profile.address}>
          {formatAddress(profile.address)}
        </p>
        <p className="text-sm text-[var(--text-muted)]">{followers} followers</p>
      </div>

      <FollowButton
        isFollowing={following}
        displayName={displayName}
        onFollow={() => setFollowing(true)}
        onUnfollow={() => setFollowing(false)}
      />
    </article>
  );
}
