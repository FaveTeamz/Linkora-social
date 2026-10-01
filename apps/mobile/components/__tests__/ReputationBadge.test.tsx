import React from "react";
import { render } from "@testing-library/react-native";

import { ReputationBadge, type ReputationTier } from "../ReputationBadge";

const TIERS: ReputationTier[] = ["newcomer", "member", "trusted", "verified", "legend"];

describe("ReputationBadge", () => {
  it.each(TIERS)("renders correctly for tier '%s'", (tier) => {
    const { toJSON } = render(<ReputationBadge tier={tier} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
