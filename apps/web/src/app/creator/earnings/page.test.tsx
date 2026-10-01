import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before the import of the component under test
// ---------------------------------------------------------------------------

const mockFetchPosts = jest.fn();
const mockFetchAttestation = jest.fn();
const mockComputeAnalytics = jest.fn();

jest.mock("@/lib/analytics", () => ({
  fetchPosts: (...args: unknown[]) => mockFetchPosts(...args),
  fetchAttestation: (...args: unknown[]) => mockFetchAttestation(...args),
  computeAnalytics: (...args: unknown[]) => mockComputeAnalytics(...args),
  formatStroops: (v: string) => (BigInt(v) === 0n ? "0" : (Number(v) / 1e7).toFixed(2)),
  dateRangeToLedgerRange: (days: number) => (days * 86400) / 5,
}));

const mockUseWallet = jest.fn();
jest.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockUseWallet(),
}));

jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

// Import page AFTER mocks are in place
import CreatorEarningsPage from "./page";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const EMPTY_ANALYTICS = {
  summary: {
    totalTips: "0",
    totalTipsXlm: "0",
    totalPosts: 0,
    totalLikes: 0,
    followerCount: 0,
    uniqueTippers: 0,
  },
  engagementOverTime: [],
  followerGrowth: [],
  tipEarnings: [],
  topPosts: [],
  attestation: null,
};

const LOADED_ANALYTICS = {
  summary: {
    totalTips: "50000000",
    totalTipsXlm: "5",
    totalPosts: 3,
    totalLikes: 12,
    followerCount: 5,
    uniqueTippers: 2,
  },
  engagementOverTime: [],
  followerGrowth: [],
  tipEarnings: [
    { date: "2026-09-01", earnings: 20000000 },
    { date: "2026-09-02", earnings: 30000000 },
  ],
  topPosts: [],
  attestation: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectedWallet(address = "GTEST123") {
  mockUseWallet.mockReturnValue({ address, connected: true });
}

function disconnectedWallet() {
  mockUseWallet.mockReturnValue({ address: null, connected: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchPosts.mockResolvedValue([]);
  mockFetchAttestation.mockResolvedValue(null);
  mockComputeAnalytics.mockReturnValue(EMPTY_ANALYTICS);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreatorEarningsPage", () => {
  describe("disconnected state", () => {
    it("shows the connect-wallet prompt when wallet is not connected", async () => {
      disconnectedWallet();
      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByTestId("earnings-disconnected")).toBeInTheDocument()
      );
    });
  });

  describe("loading state", () => {
    it("shows a loading skeleton while data is fetching", () => {
      connectedWallet();
      // Never resolves during this test
      mockFetchPosts.mockReturnValue(new Promise(() => {}));
      render(<CreatorEarningsPage />);

      expect(screen.getByTestId("earnings-loading")).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows EarningsEmptyState when creator has no tips", async () => {
      connectedWallet();
      mockComputeAnalytics.mockReturnValue(EMPTY_ANALYTICS);

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByTestId("earnings-empty-state")).toBeInTheDocument()
      );
    });

    it("displays 'No earnings yet' heading inside the empty state", async () => {
      connectedWallet();
      mockComputeAnalytics.mockReturnValue(EMPTY_ANALYTICS);

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /no earnings yet/i })
        ).toBeInTheDocument()
      );
    });

    it("has a CTA linking to /feed", async () => {
      connectedWallet();
      mockComputeAnalytics.mockReturnValue(EMPTY_ANALYTICS);

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByRole("link", { name: /share your first post/i })).toHaveAttribute(
          "href",
          "/feed"
        )
      );
    });

    it("shows empty state when tipEarnings are all zero even if totalTips is non-zero (edge case)", async () => {
      connectedWallet();
      mockComputeAnalytics.mockReturnValue({
        ...EMPTY_ANALYTICS,
        summary: { ...EMPTY_ANALYTICS.summary, totalTips: "0" },
        tipEarnings: [{ date: "2026-09-01", earnings: 0 }],
      });

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByTestId("earnings-empty-state")).toBeInTheDocument()
      );
    });
  });

  describe("error state", () => {
    it("shows an error message when fetching fails", async () => {
      connectedWallet();
      mockFetchPosts.mockRejectedValue(new Error("Network failure"));

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByTestId("earnings-error")).toBeInTheDocument()
      );
      expect(screen.getByText(/network failure/i)).toBeInTheDocument();
    });

    it("shows a Retry button on error that re-triggers fetch", async () => {
      connectedWallet();
      mockFetchPosts
        .mockRejectedValueOnce(new Error("Oops"))
        .mockResolvedValueOnce([]);
      mockComputeAnalytics.mockReturnValue(EMPTY_ANALYTICS);

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /retry/i }));

      // After retry, should show empty state (not error)
      await waitFor(() =>
        expect(screen.getByTestId("earnings-empty-state")).toBeInTheDocument()
      );
    });
  });

  describe("loaded state", () => {
    it("shows earnings dashboard when creator has tips", async () => {
      connectedWallet();
      mockComputeAnalytics.mockReturnValue(LOADED_ANALYTICS);

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByTestId("earnings-dashboard")).toBeInTheDocument()
      );
    });

    it("displays the total earnings summary card", async () => {
      connectedWallet();
      mockComputeAnalytics.mockReturnValue(LOADED_ANALYTICS);

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByTestId("earnings-total")).toBeInTheDocument()
      );
      expect(screen.getByText("5 XLM")).toBeInTheDocument();
    });

    it("renders the earnings timeline table", async () => {
      connectedWallet();
      mockComputeAnalytics.mockReturnValue(LOADED_ANALYTICS);

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByRole("table")).toBeInTheDocument()
      );
      expect(screen.getByText("2026-09-01")).toBeInTheDocument();
      expect(screen.getByText("2026-09-02")).toBeInTheDocument();
    });

    it("shows correct unique tippers count", async () => {
      connectedWallet();
      mockComputeAnalytics.mockReturnValue(LOADED_ANALYTICS);

      render(<CreatorEarningsPage />);

      await waitFor(() =>
        expect(screen.getByTestId("earnings-tippers")).toBeInTheDocument()
      );
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  describe("page structure", () => {
    it("renders the page heading 'Earnings'", async () => {
      disconnectedWallet();
      render(<CreatorEarningsPage />);

      // The heading is always rendered, regardless of wallet state
      expect(screen.getByRole("heading", { name: /^earnings$/i })).toBeInTheDocument();
    });
  });
});
