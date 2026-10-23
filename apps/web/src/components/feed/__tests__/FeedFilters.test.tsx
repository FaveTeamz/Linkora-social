import { fireEvent, render, screen } from "@testing-library/react";
import { FeedFilters, FeedTab } from "../FeedFilters";

describe("FeedFilters", () => {
  it("renders all three filter tabs", () => {
    render(<FeedFilters activeTab="explore" onTabChange={jest.fn()} />);

    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Explore" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Following" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Trending" })).toBeInTheDocument();
  });

  it.each([
    ["Explore", "explore"],
    ["Following", "following"],
    ["Trending", "trending"],
  ] as const)("calls onTabChange with %s when selected", (label, value) => {
    const onTabChange = jest.fn<void, [FeedTab]>();
    render(<FeedFilters activeTab="explore" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole("tab", { name: label }));

    expect(onTabChange).toHaveBeenCalledWith(value);
  });

  it("marks only the active tab as selected", () => {
    render(<FeedFilters activeTab="following" onTabChange={jest.fn()} />);

    expect(screen.getByRole("tab", { name: "Following" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "Explore" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    expect(screen.getByRole("tab", { name: "Trending" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });
});
