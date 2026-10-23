import { fireEvent, render, screen } from "@testing-library/react";
import { FeedErrorBoundary } from "../FeedErrorBoundary";

describe("FeedErrorBoundary", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it("renders children when there is no error", () => {
    render(
      <FeedErrorBoundary>
        <p>Feed content</p>
      </FeedErrorBoundary>
    );

    expect(screen.getByText("Feed content")).toBeInTheDocument();
  });

  it("shows the recovery UI when a child throws", () => {
    function BrokenChild(): JSX.Element {
      throw new Error("Feed failed");
    }

    render(
      <FeedErrorBoundary>
        <BrokenChild />
      </FeedErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Feed failed");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("resets its error state when Try again is clicked", () => {
    let shouldThrow = true;
    function FlakyChild(): JSX.Element {
      if (shouldThrow) throw new Error("Temporary feed failure");
      return <p>Feed recovered</p>;
    }

    render(
      <FeedErrorBoundary onReset={() => (shouldThrow = false)}>
        <FlakyChild />
      </FeedErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Feed recovered")).toBeInTheDocument();
  });

  it("renders a custom fallback with the caught error", () => {
    function BrokenChild(): JSX.Element {
      throw new Error("Custom fallback error");
    }

    render(
      <FeedErrorBoundary fallback={(error) => <p>Custom: {error.message}</p>}>
        <BrokenChild />
      </FeedErrorBoundary>
    );

    expect(screen.getByText("Custom: Custom fallback error")).toBeInTheDocument();
  });

  it("calls componentDidCatch with the error and component stack", () => {
    const didCatch = jest.spyOn(FeedErrorBoundary.prototype, "componentDidCatch");
    function BrokenChild(): JSX.Element {
      throw new Error("Capture details");
    }

    render(
      <FeedErrorBoundary>
        <BrokenChild />
      </FeedErrorBoundary>
    );

    expect(didCatch).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Capture details" }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
    didCatch.mockRestore();
  });
});
