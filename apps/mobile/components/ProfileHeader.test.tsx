import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react-native";
import ProfileHeader, { type ProfileData } from "../ProfileHeader";

// ---------------------------------------------------------------------------
// Mock expo-clipboard
// ---------------------------------------------------------------------------
const mockSetStringAsync = jest.fn();

jest.mock("expo-clipboard", () => ({
  setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args),
}));

// ---------------------------------------------------------------------------
// Mock the useTheme hook with a minimal light-theme stub
// ---------------------------------------------------------------------------
jest.mock("../../theme/useTheme", () => ({
  useTheme: () => ({
    theme: {
      colors: {
        brand: { primary: "#7C3AED" },
        surface: {
          background: "#FFFFFF",
          surface1: "#F9FAFB",
          border: "#E5E7EB",
        },
        text: {
          primary: "#111827",
          secondary: "#6B7280",
          onBrand: "#FFFFFF",
        },
      },
      radius: { full: 9999 },
    },
  }),
}));

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const FULL_ADDRESS = "GBXXXXXXXSTELLARADDRESS1234567890ABCDEFGHIJK";
const PROFILE: ProfileData = {
  address: FULL_ADDRESS,
  username: "stellaruser",
  bio: "Building on Stellar",
};

const DEFAULT_PROPS = {
  profile: PROFILE,
  followerCount: 42,
  followingCount: 17,
  isFollowing: false,
  isOwnProfile: false,
  onFollowersPress: jest.fn(),
  onFollowingPress: jest.fn(),
  onEditPress: jest.fn(),
  onToggleFollow: jest.fn(),
};

beforeEach(() => {
  mockSetStringAsync.mockReset().mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProfileHeader", () => {
  describe("address display", () => {
    it("renders the truncated address", () => {
      render(<ProfileHeader {...DEFAULT_PROPS} />);
      // shortAddress = first 8 + last 6 chars of FULL_ADDRESS
      const truncated = `${FULL_ADDRESS.slice(0, 8)}…${FULL_ADDRESS.slice(-6)}`;
      expect(screen.getByTestId("profile-address")).toBeTruthy();
      expect(screen.getByText(truncated)).toBeTruthy();
    });

    it("includes the full address in the accessibility label", () => {
      render(<ProfileHeader {...DEFAULT_PROPS} />);
      expect(
        screen.getByA11yLabel(`Address: ${FULL_ADDRESS}`)
      ).toBeTruthy();
    });
  });

  describe("copy button", () => {
    it("renders a copy button with the correct accessibility label", () => {
      render(<ProfileHeader {...DEFAULT_PROPS} />);
      expect(
        screen.getByA11yLabel("Copy address to clipboard")
      ).toBeTruthy();
    });

    it("calls Clipboard.setStringAsync with the full address on press", async () => {
      render(<ProfileHeader {...DEFAULT_PROPS} />);
      const copyBtn = screen.getByTestId("copy-address-btn");

      await act(async () => {
        fireEvent.press(copyBtn);
      });

      expect(mockSetStringAsync).toHaveBeenCalledTimes(1);
      expect(mockSetStringAsync).toHaveBeenCalledWith(FULL_ADDRESS);
    });

    it("shows 'Copied!' text after a successful copy", async () => {
      render(<ProfileHeader {...DEFAULT_PROPS} />);
      const copyBtn = screen.getByTestId("copy-address-btn");

      await act(async () => {
        fireEvent.press(copyBtn);
      });

      // The button text should change to the copied feedback
      expect(screen.getByText("✓ Copied!")).toBeTruthy();
    });

    it("resets back to 'Copy' text after the feedback duration", async () => {
      jest.useFakeTimers();
      render(<ProfileHeader {...DEFAULT_PROPS} copyFeedbackDuration={300} />);
      const copyBtn = screen.getByTestId("copy-address-btn");

      await act(async () => {
        fireEvent.press(copyBtn);
      });

      // Feedback is visible
      expect(screen.getByText("✓ Copied!")).toBeTruthy();

      // Advance past the feedback duration
      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText("Copy")).toBeTruthy();
      });

      jest.useRealTimers();
    });

    it("initially shows 'Copy' label before any interaction", () => {
      render(<ProfileHeader {...DEFAULT_PROPS} />);
      expect(screen.getByText("Copy")).toBeTruthy();
    });
  });

  describe("follower / following counts", () => {
    it("renders follower and following counts", () => {
      render(<ProfileHeader {...DEFAULT_PROPS} />);
      expect(screen.getByTestId("follower-count")).toBeTruthy();
      expect(screen.getByTestId("following-count")).toBeTruthy();
    });

    it("renders '—' when counts are null (loading state)", () => {
      render(
        <ProfileHeader
          {...DEFAULT_PROPS}
          followerCount={null}
          followingCount={null}
        />
      );
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBe(2);
    });
  });

  describe("own-profile vs other-profile actions", () => {
    it("shows Edit button when isOwnProfile is true", () => {
      render(<ProfileHeader {...DEFAULT_PROPS} isOwnProfile={true} />);
      expect(screen.getByA11yRole("button", { name: /edit/i })).toBeTruthy();
    });

    it("shows Follow button when isOwnProfile is false", () => {
      render(<ProfileHeader {...DEFAULT_PROPS} isOwnProfile={false} />);
      expect(screen.getByA11yRole("button", { name: /follow/i })).toBeTruthy();
    });

    it("shows Following button text when isFollowing is true", () => {
      render(
        <ProfileHeader {...DEFAULT_PROPS} isOwnProfile={false} isFollowing={true} />
      );
      expect(screen.getByText("Following")).toBeTruthy();
    });
  });
});
