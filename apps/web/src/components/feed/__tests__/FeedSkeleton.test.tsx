import { render, screen } from "@testing-library/react";
import { FeedSkeleton } from "../FeedSkeleton";

describe("FeedSkeleton", () => {
  it("renders five labeled post placeholders by default and marks the feed busy", () => {
    render(<FeedSkeleton />);

    expect(screen.getAllByRole("group", { name: "Loading post" })).toHaveLength(5);
    expect(screen.getByRole("status", { name: "Loading feed" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
  });

  it("renders the requested number of placeholders", () => {
    render(<FeedSkeleton count={2} />);

    expect(screen.getAllByRole("group", { name: "Loading post" })).toHaveLength(2);
  });
});
