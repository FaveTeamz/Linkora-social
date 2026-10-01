import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DashboardPage from "../page";

describe("DashboardPage", () => {
  it("renders the three-column dashboard layout elements", () => {
    render(<DashboardPage />);

    // Left Sidebar + MobileTopTabs both render nav items — use getAllByText
    expect(screen.getByText("Linkora")).toBeInTheDocument();
    // "Ohcine" appears in both LeftSidebar and MobileTopTabs
    expect(screen.getAllByText("Ohcine").length).toBeGreaterThanOrEqual(1);

    // Main Content Area elements
    expect(screen.getByText("Daskloode")).toBeInTheDocument();
    expect(screen.getByText("Cont rives")).toBeInTheDocument();
    expect(screen.getByText("F0A8200")).toBeInTheDocument();
    expect(screen.getByText("Mycontonts")).toBeInTheDocument();
    expect(screen.getByText("Deshlohns")).toBeInTheDocument();

    // Post cards content
    expect(screen.getAllByText("Alex Rivera")[0]).toBeInTheDocument();
    expect(screen.getAllByText("@7CAI.326")[0]).toBeInTheDocument();

    // Right Sidebar elements
    expect(screen.getByPlaceholderText("Search Linkora...")).toBeInTheDocument();
    expect(screen.getByText("Trending Topic")).toBeInTheDocument();
    expect(screen.getByText("Sorgecte Connocticins")).toBeInTheDocument();
  });

  it("toggles skeleton view when button is clicked", () => {
    render(<DashboardPage />);
    const skeletonButton = screen.getByText("Skeleton View");
    fireEvent.click(skeletonButton);

    expect(screen.getByText("Show Posts")).toBeInTheDocument();
  });
});
