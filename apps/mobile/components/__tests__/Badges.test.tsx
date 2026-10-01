import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { NotificationBadge } from "../NotificationBadge";
import { ReputationBadge, deriveReputationTier } from "../ReputationBadge";

describe("NotificationBadge", () => {
  it("renders count when positive", () => {
    const { getByText, getByTestId } = render(<NotificationBadge count={5} />);
    expect(getByText("5")).toBeTruthy();
    expect(getByTestId("notification-badge").props.accessibilityLabel).toBe(
      "5 unread notifications"
    );
  });

  it("truncates when exceeding maxCount", () => {
    const { getByText } = render(<NotificationBadge count={120} maxCount={99} />);
    expect(getByText("99+")).toBeTruthy();
  });

  it("hides when count is 0 and showZero is false", () => {
    const { queryByTestId } = render(<NotificationBadge count={0} />);
    expect(queryByTestId("notification-badge")).toBeNull();
  });

  it("handles onPress and sets accessibility role to button", () => {
    const onPressMock = jest.fn();
    const { getByTestId } = render(<NotificationBadge count={3} onPress={onPressMock} />);
    const badge = getByTestId("notification-badge");
    expect(badge.props.accessibilityRole).toBe("button");
    fireEvent.press(badge);
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });
});

describe("ReputationBadge", () => {
  it("derives correct tiers from score", () => {
    expect(deriveReputationTier(50)).toBe("bronze");
    expect(deriveReputationTier(250)).toBe("silver");
    expect(deriveReputationTier(600)).toBe("gold");
    expect(deriveReputationTier(800)).toBe("platinum");
    expect(deriveReputationTier(950)).toBe("diamond");
  });

  it("renders tier and score", () => {
    const { getByText, getByTestId } = render(<ReputationBadge score={750} tier="platinum" />);
    expect(getByText("Platinum")).toBeTruthy();
    expect(getByText("750")).toBeTruthy();
    expect(getByTestId("reputation-badge").props.accessibilityLabel).toBe(
      "Reputation tier: Platinum, Score: 750"
    );
  });

  it("handles onPress with accessibility role button", () => {
    const onPressMock = jest.fn();
    const { getByTestId } = render(<ReputationBadge score={500} onPress={onPressMock} />);
    const badge = getByTestId("reputation-badge");
    expect(badge.props.accessibilityRole).toBe("button");
    fireEvent.press(badge);
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });
});
