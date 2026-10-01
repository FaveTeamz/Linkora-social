import React from "react";
import { render, screen } from "@testing-library/react";
import { EarningsEmptyState } from "./EarningsEmptyState";

// Mock next/link — just render the href as a plain anchor in tests
jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

describe("EarningsEmptyState", () => {
  it("renders without crashing", () => {
    render(<EarningsEmptyState />);
    expect(screen.getByTestId("earnings-empty-state")).toBeInTheDocument();
  });

  it("displays the 'No earnings yet' heading", () => {
    render(<EarningsEmptyState />);
    expect(
      screen.getByRole("heading", { name: /no earnings yet/i })
    ).toBeInTheDocument();
  });

  it("renders the body copy describing how to earn tips", () => {
    render(<EarningsEmptyState />);
    expect(screen.getByText(/you haven't received any tips yet/i)).toBeInTheDocument();
  });

  it("renders the CTA link pointing to /feed", () => {
    render(<EarningsEmptyState />);
    const cta = screen.getByTestId("earnings-empty-cta");
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/feed");
  });

  it("CTA has the correct text 'Share your first post'", () => {
    render(<EarningsEmptyState />);
    expect(
      screen.getByRole("link", { name: /share your first post/i })
    ).toBeInTheDocument();
  });

  it("has role='status' and aria-live='polite' for screen-reader notification", () => {
    render(<EarningsEmptyState />);
    const wrapper = screen.getByTestId("earnings-empty-state");
    expect(wrapper).toHaveAttribute("role", "status");
    expect(wrapper).toHaveAttribute("aria-live", "polite");
  });

  it("renders as h2 by default", () => {
    render(<EarningsEmptyState />);
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("renders as h3 when headingLevel={3}", () => {
    render(<EarningsEmptyState headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });

  it("renders the SVG illustration (aria-hidden)", () => {
    const { container } = render(<EarningsEmptyState />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
