import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { CopyAddressButton } from "./CopyAddressButton";

const FULL_ADDRESS = "GBXXXXXXXSTELLARADDRESS1234567890ABCDEFGHIJK";

// ---------------------------------------------------------------------------
// Clipboard API mock
// ---------------------------------------------------------------------------
const mockWriteText = jest.fn();

beforeEach(() => {
  mockWriteText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockWriteText },
    configurable: true,
    writable: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CopyAddressButton", () => {
  it("renders a truncated address", () => {
    render(<CopyAddressButton address={FULL_ADDRESS} />);
    // Full address should NOT be visible as plain text (it's truncated)
    expect(screen.queryByText(FULL_ADDRESS)).not.toBeInTheDocument();
    // Truncated prefix must be present
    expect(screen.getByText(/GBXXXX/)).toBeInTheDocument();
  });

  it("exposes the full address in the aria-label and title attributes", () => {
    render(<CopyAddressButton address={FULL_ADDRESS} />);
    // The address span carries the full address for assistive technology
    const addressSpan = screen.getByLabelText(`Address: ${FULL_ADDRESS}`);
    expect(addressSpan).toBeInTheDocument();
    expect(addressSpan).toHaveAttribute("title", FULL_ADDRESS);
  });

  it("renders a copy button with an accessible label", () => {
    render(<CopyAddressButton address={FULL_ADDRESS} />);
    expect(
      screen.getByRole("button", { name: /copy address to clipboard/i })
    ).toBeInTheDocument();
  });

  it("calls navigator.clipboard.writeText with the full address on click", async () => {
    render(<CopyAddressButton address={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy address to clipboard/i });

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockWriteText).toHaveBeenCalledTimes(1);
    expect(mockWriteText).toHaveBeenCalledWith(FULL_ADDRESS);
  });

  it("shows a 'Copied!' tooltip after a successful copy", async () => {
    render(<CopyAddressButton address={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy address to clipboard/i });

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(screen.getByRole("tooltip")).toHaveTextContent("Copied!");
  });

  it("announces to screen readers via the live region after copy", async () => {
    render(<CopyAddressButton address={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy address to clipboard/i });

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Address copied to clipboard.");
  });

  it("activates copy on Enter key press", async () => {
    render(<CopyAddressButton address={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy address to clipboard/i });

    await act(async () => {
      fireEvent.keyDown(btn, { key: "Enter", code: "Enter" });
    });

    expect(mockWriteText).toHaveBeenCalledWith(FULL_ADDRESS);
  });

  it("activates copy on Space key press", async () => {
    render(<CopyAddressButton address={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy address to clipboard/i });

    await act(async () => {
      fireEvent.keyDown(btn, { key: " ", code: "Space" });
    });

    expect(mockWriteText).toHaveBeenCalledWith(FULL_ADDRESS);
  });

  it("hides the tooltip again after the feedbackDuration elapses", async () => {
    jest.useFakeTimers();
    render(<CopyAddressButton address={FULL_ADDRESS} feedbackDuration={200} />);
    const btn = screen.getByRole("button", { name: /copy address to clipboard/i });

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(200);
    });

    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    );

    jest.useRealTimers();
  });

  it("does not throw when the Clipboard API is unavailable", async () => {
    mockWriteText.mockRejectedValueOnce(new Error("Not allowed"));
    render(<CopyAddressButton address={FULL_ADDRESS} />);
    const btn = screen.getByRole("button", { name: /copy address to clipboard/i });

    // Should not throw
    await act(async () => {
      fireEvent.click(btn);
    });

    // Tooltip should NOT appear since copy failed
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("passes basic accessibility checks", async () => {
    const { container } = render(<CopyAddressButton address={FULL_ADDRESS} />);
    const { axe } = await import("jest-axe");
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
