"use client";

import { useCallback } from "react";
import type { Options as ConfettiOptions } from "canvas-confetti";

/**
 * Session-storage key that tracks whether the first-tip confetti has already
 * fired during this browser session. Using sessionStorage (not localStorage)
 * ensures the celebration reappears on every new session while still firing
 * only once per session, satisfying the acceptance criteria.
 */
const SESSION_KEY = "linkora:confetti:first-tip-shown";

/**
 * useConfetti
 *
 * Returns a `fireConfetti` callback that:
 *  - Dynamically imports canvas-confetti (code-split, zero cost if never called)
 *  - Fires a celebratory burst only once per browser session
 *  - Is a no-op when the user has `prefers-reduced-motion: reduce` set
 *
 * Usage:
 *   const { fireConfetti } = useConfetti();
 *   // call fireConfetti() when the first tip notification arrives
 */
export function useConfetti() {
  const fireConfetti = useCallback(async (options?: ConfettiOptions) => {
    // Respect the OS/browser reduced-motion accessibility preference.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    // Guard: only fire once per browser session.
    if (typeof sessionStorage !== "undefined") {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    }

    // Dynamically import canvas-confetti so it doesn't bloat the initial bundle.
    const { default: confetti } = await import("canvas-confetti");

    // Default burst — two overlapping volleys for a fuller effect.
    const defaults: ConfettiOptions = {
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#7c3aed", "#a855f7", "#d946ef", "#38bdf8", "#10b981", "#fbbf24"],
      zIndex: 9999,
    };

    const mergedOptions = { ...defaults, ...options };

    // Fire two volleys slightly offset horizontally for a celebratory spread.
    confetti({ ...mergedOptions, origin: { x: 0.3, y: 0.6 } });
    confetti({ ...mergedOptions, origin: { x: 0.7, y: 0.6 } });
  }, []);

  return { fireConfetti };
}
