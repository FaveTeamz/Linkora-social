import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { LeftSidebar } from "../LeftSidebar";
import { RightSidebar } from "../RightSidebar";

// ---------------------------------------------------------------------------
// Helpers for requestAnimationFrame-based animation
// ---------------------------------------------------------------------------

/**
 * Replace rAF with a manual queue so we control when frames fire.
 * Returns a `flush` function that runs all pending callbacks at a given
 * simulated timestamp, advancing until no new frames are queued.
 */
function mockRaf() {
  const pending: Array<FrameRequestCallback> = [];
  let nextId = 1;

  const originalRaf = global.requestAnimationFrame;
  const originalCaf = global.cancelAnimationFrame;

  global.requestAnimationFrame = (cb: FrameRequestCallback) => {
    pending.push(cb);
    return nextId++;
  };

  global.cancelAnimationFrame = (id: number) => {
    // No-op: we don't track ids in this simple mock
    void id;
  };

  /** Run all pending rAF callbacks at the given timestamp. */
  function flush(timestamp = 0) {
    while (pending.length > 0) {
      const cb = pending.shift()!;
      cb(timestamp);
    }
  }

  function restore() {
    global.requestAnimationFrame = originalRaf;
    global.cancelAnimationFrame = originalCaf;
  }

  return { flush, restore };
}

// ---------------------------------------------------------------------------
// LeftSidebar
// ---------------------------------------------------------------------------

describe("LeftSidebar", () => {
  it("renders logo and all 7 navigation items", () => {
    render(<LeftSidebar />);
    expect(screen.getByText("Linkora")).toBeInTheDocument();
    expect(screen.getByText("Ohcine")).toBeInTheDocument();
    expect(screen.getByText("Fumcine")).toBeInTheDocument();
    expect(screen.getByText("O6LAMB")).toBeInTheDocument();
    expect(screen.getByText("USAS3BB")).toBeInTheDocument();
    expect(screen.getByText("VBALSBB")).toBeInTheDocument();
    expect(screen.getByText("VewITB")).toBeInTheDocument();
    expect(screen.getByText("Doots")).toBeInTheDocument();
    expect(screen.getByText("My Soore")).toBeInTheDocument();
  });

  it("toggles collapse mode when collapse button is clicked", () => {
    render(<LeftSidebar />);
    const collapseButton = screen.getByRole("button", { name: /collapse sidebar/i });
    fireEvent.click(collapseButton);

    expect(screen.queryByText("Ohcine")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RightSidebar
// ---------------------------------------------------------------------------

describe("RightSidebar", () => {
  it("renders search input, user profile, trending topics, and suggested connections", () => {
    render(<RightSidebar />);
    expect(screen.getByPlaceholderText("Search Linkora...")).toBeInTheDocument();
    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("@7CAI.326")).toBeInTheDocument();
    expect(screen.getByText("Trending Topic")).toBeInTheDocument();
    expect(screen.getByText("Sorgecte Connocticins")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Count-up animation: numbers animate from 0 → final value (#191)
  // -------------------------------------------------------------------------

  it("stat labels are always visible in the profile card", () => {
    const { flush, restore } = mockRaf();
    try {
      render(<RightSidebar />);
      expect(screen.getByText("Followers")).toBeInTheDocument();
      expect(screen.getByText("Following")).toBeInTheDocument();
      expect(screen.getByText("Posts")).toBeInTheDocument();
      // Flush any pending frames so we don't leave dangling state updates.
      act(() => { flush(0); });
    } finally {
      restore();
    }
  });

  it("stat numbers start at 0 on mount (before animation runs)", () => {
    const { flush, restore } = mockRaf();
    try {
      // Render but do NOT flush any rAF frames yet.
      render(<RightSidebar />);

      // At t=0 all counts should still be 0 (no frames have fired).
      // The aria-label carries both label and value for each stat.
      expect(screen.getByLabelText("Followers: 0")).toBeInTheDocument();
      expect(screen.getByLabelText("Following: 0")).toBeInTheDocument();
      expect(screen.getByLabelText("Posts: 0")).toBeInTheDocument();

      // Clean up pending frames.
      act(() => { flush(0); });
    } finally {
      restore();
    }
  });

  it("stat numbers reach their final values after the animation completes", () => {
    const { flush, restore } = mockRaf();
    try {
      render(<RightSidebar />);

      // Simulate the end of the 1200 ms animation by providing a timestamp
      // equal to the duration so progress = 1 and easeOut(1) = 1.
      act(() => { flush(1200); });
      // One more flush in case the final frame queued a new rAF call.
      act(() => { flush(1200); });

      expect(screen.getByLabelText("Followers: 1,420")).toBeInTheDocument();
      expect(screen.getByLabelText("Following: 385")).toBeInTheDocument();
      expect(screen.getByLabelText("Posts: 94")).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it("respects prefers-reduced-motion by jumping straight to final values", () => {
    // Mock the media query to report reduced-motion preference.
    const original = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      } as MediaQueryList);

    try {
      render(<RightSidebar />);

      // With reduced motion, values should jump to final immediately — no rAF needed.
      expect(screen.getByLabelText("Followers: 1,420")).toBeInTheDocument();
      expect(screen.getByLabelText("Following: 385")).toBeInTheDocument();
      expect(screen.getByLabelText("Posts: 94")).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});
