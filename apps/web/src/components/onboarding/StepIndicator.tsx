"use client";

/**
 * StepIndicator.tsx
 *
 * Animated onboarding progress indicator.
 *
 * Visual states:
 *  - Completed step  → filled violet circle with ✓ checkmark
 *  - Current step    → outlined circle that pulses (ring animation)
 *  - Future step     → muted outlined circle with step number
 *  - Progress bar between steps fills as the user advances
 *
 * Accessibility:
 *  - respects prefers-reduced-motion — all animations are disabled when the
 *    user has opted in to reduced motion
 *  - role="list" + role="listitem" for screen-reader enumeration
 *  - aria-current="step" on the active dot
 */

import { useEffect, useRef } from "react";
import type { WalletState } from "@/hooks/useWallet";

const STEPS = [
  { id: "install", label: "Install" },
  { id: "connect", label: "Connect" },
  { id: "fund", label: "Fund" },
  { id: "profile", label: "Profile" },
];

function stepIndex(state: WalletState): number {
  switch (state) {
    case "not_installed":
      return 0;
    case "not_connected":
      return 1;
    case "connected_no_profile":
      return 2;
    case "ready":
      return 4;
    default:
      return 0;
  }
}

// ── Pulse keyframe ───────────────────────────────────────────────────────────

const PULSE_KEYFRAME = `
  @keyframes step-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.55); }
    70%  { box-shadow: 0 0 0 8px rgba(139, 92, 246, 0); }
    100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
  }

  @keyframes step-fill {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }

  @keyframes step-check {
    from { transform: scale(0) rotate(-45deg); opacity: 0; }
    to   { transform: scale(1) rotate(0deg); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .step-pulse { animation: none !important; }
    .step-fill  { animation: none !important; }
    .step-check { animation: none !important; }
  }
`;

function useInjectStyles(css: string) {
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    const style = document.createElement("style");
    style.setAttribute("data-step-indicator", "");
    style.textContent = css;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [css]);
}

// ── Component ────────────────────────────────────────────────────────────────

export function StepIndicator({
  state,
  balance,
}: {
  state: WalletState;
  balance: string | null;
}) {
  useInjectStyles(PULSE_KEYFRAME);

  const funded = balance !== null && parseFloat(balance) > 0;
  const current =
    state === "connected_no_profile" && funded ? 3 : stepIndex(state);

  return (
    <div
      className="flex items-center justify-center gap-0 w-full max-w-sm mx-auto mb-8"
      role="list"
      aria-label="Onboarding progress"
    >
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;

        return (
          <div key={step.id} className="flex items-center flex-1" role="listitem">
            <div className="flex flex-col items-center flex-1">
              {/* ── Step dot ─────────────────────────────────────────── */}
              <div
                aria-current={active ? "step" : undefined}
                aria-label={`${step.label}: ${done ? "completed" : active ? "current" : "upcoming"}`}
                style={
                  active
                    ? {
                        animation: "step-pulse 1.8s ease-out infinite",
                      }
                    : undefined
                }
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300",
                  "step-pulse",
                  done
                    ? "bg-violet-600 border-violet-600 text-white"
                    : active
                      ? "border-violet-500 text-violet-400 bg-transparent"
                      : "border-[var(--border)] text-[var(--text-muted)] bg-transparent",
                ].join(" ")}
              >
                {done ? (
                  /* Animated checkmark */
                  <span
                    aria-hidden="true"
                    className="step-check"
                    style={{
                      display: "inline-block",
                      animation: "step-check 0.3s ease-out forwards",
                    }}
                  >
                    ✓
                  </span>
                ) : (
                  i + 1
                )}
              </div>

              {/* ── Step label ───────────────────────────────────────── */}
              <span
                className={[
                  "text-xs mt-1 transition-colors duration-300",
                  active
                    ? "text-violet-400 font-semibold"
                    : done
                      ? "text-violet-500"
                      : "text-[var(--text-muted)]",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>

            {/* ── Progress connector bar ───────────────────────────── */}
            {i < STEPS.length - 1 && (
              <div
                className="h-0.5 flex-1 mb-5 bg-[var(--border)] overflow-hidden rounded-full"
                aria-hidden="true"
              >
                <div
                  className="h-full bg-violet-600 step-fill"
                  style={{
                    width: "100%",
                    transformOrigin: "left center",
                    transform: done ? "scaleX(1)" : "scaleX(0)",
                    transition: "transform 0.4s ease",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
