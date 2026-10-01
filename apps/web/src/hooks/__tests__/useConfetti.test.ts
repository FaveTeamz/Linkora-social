import { renderHook, act } from "@testing-library/react";
import { useConfetti } from "../useConfetti";

// Mock canvas-confetti so no real canvas operations run in jsdom.
const mockConfetti = jest.fn();
jest.mock("canvas-confetti", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockConfetti(...args),
}));

const SESSION_KEY = "linkora:confetti:first-tip-shown";

beforeEach(() => {
  mockConfetti.mockClear();
  sessionStorage.clear();
});

describe("useConfetti", () => {
  it("fires confetti on first call", async () => {
    const { result } = renderHook(() => useConfetti());

    await act(async () => {
      await result.current.fireConfetti();
    });

    // Two volleys should be fired (left + right origin)
    expect(mockConfetti).toHaveBeenCalledTimes(2);
  });

  it("does not fire confetti a second time in the same session", async () => {
    const { result } = renderHook(() => useConfetti());

    await act(async () => {
      await result.current.fireConfetti();
    });
    await act(async () => {
      await result.current.fireConfetti();
    });

    // Still only two calls total — second invocation is suppressed by session guard
    expect(mockConfetti).toHaveBeenCalledTimes(2);
  });

  it("sets the session key after first fire", async () => {
    const { result } = renderHook(() => useConfetti());

    await act(async () => {
      await result.current.fireConfetti();
    });

    expect(sessionStorage.getItem(SESSION_KEY)).toBe("1");
  });

  it("does not fire when session key is already set", async () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    const { result } = renderHook(() => useConfetti());

    await act(async () => {
      await result.current.fireConfetti();
    });

    expect(mockConfetti).not.toHaveBeenCalled();
  });

  it("does not fire when prefers-reduced-motion is set", async () => {
    // Override matchMedia to report reduced motion
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });

    const { result } = renderHook(() => useConfetti());

    await act(async () => {
      await result.current.fireConfetti();
    });

    expect(mockConfetti).not.toHaveBeenCalled();
    // Session key should NOT be set when motion is reduced (no milestone recorded)
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
