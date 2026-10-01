import React from "react";
import { render } from "@testing-library/react-native";

import { NotificationBadge } from "../NotificationBadge";

describe("NotificationBadge", () => {
  it("renders null when count is 0", () => {
    const { toJSON } = render(<NotificationBadge count={0} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it("renders null when count is negative", () => {
    const { toJSON } = render(<NotificationBadge count={-1} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it("renders the count when count is 5", () => {
    const { toJSON } = render(<NotificationBadge count={5} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it("renders '99+' when count is 100 (exceeds max)", () => {
    const { toJSON } = render(<NotificationBadge count={100} />);
    expect(toJSON()).toMatchSnapshot();
  });

  it("renders the exact count at the boundary (99)", () => {
    const { toJSON } = render(<NotificationBadge count={99} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
