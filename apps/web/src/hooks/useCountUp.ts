import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 to `target` over `duration` milliseconds.
 *
 * Features:
 * - Uses requestAnimationFrame — no library dependency.
 * - Cubic ease-out (fast start, slow end): easeOut(t) = 1 - (1 - t)^3
 * - Respects `prefers-reduced-motion`: jumps instantly to the final value
 *   when the user has requested reduced motion.
 *
 * @param target   The final integer value to count up to.
 * @param duration Animation duration in milliseconds (default 1200 ms).
 * @returns        The current animated display value.
 */
export function useCountUp(target: number, duration = 1200): number {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Respect prefers-reduced-motion — skip animation entirely.
    const motionQuery =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    if (motionQuery?.matches) {
      setCount(target);
      return;
    }

    let startTime: number | null = null;
    const startValue = 0;

    function easeOut(t: number): number {
      // Cubic ease-out: fast start → slow end
      return 1 - Math.pow(1 - t, 3);
    }

    function step(timestamp: number) {
      if (startTime === null) startTime = timestamp;

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOut(progress);
      const currentValue = Math.round(startValue + easedProgress * (target - startValue));

      setCount(currentValue);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration]);

  return count;
}
