import { fireEvent, render, screen } from "@testing-library/react";
import { NotificationList, type NotificationItem } from "../NotificationList";

const notifications: NotificationItem[] = [
  {
    id: "unread-1",
    kind: "follow",
    message: "Ada followed you",
    timestamp: "2026-01-01T12:00:00.000Z",
    read: false,
  },
  {
    id: "read-1",
    kind: "like",
    message: "Your post was liked",
    timestamp: "2026-01-01T12:05:00.000Z",
    read: true,
  },
];

describe("NotificationList", () => {
  it("renders the empty state when there are no notifications", () => {
    render(<NotificationList notifications={[]} />);
    expect(screen.getByText("No notifications yet.")).toBeInTheDocument();
  });

  it("renders a loading status while notifications are being fetched", () => {
    render(<NotificationList notifications={[]} isLoading />);
    expect(screen.getByRole("status", { name: "Loading notifications" })).toBeInTheDocument();
  });

  it("renders each notification with a distinct unread style", () => {
    render(<NotificationList notifications={notifications} />);

    expect(screen.getByText("Ada followed you")).toBeInTheDocument();
    expect(screen.getByText("Your post was liked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New follower: Ada followed you" })).toHaveClass(
      "bg-violet-900/20"
    );
    expect(screen.getByRole("button", { name: "Post liked: Your post was liked" })).toHaveClass(
      "bg-[var(--muted)]"
    );
  });

  it("marks an unread item read when activated", () => {
    const onMarkRead = jest.fn();
    render(<NotificationList notifications={notifications} onMarkRead={onMarkRead} />);

    fireEvent.click(screen.getByRole("button", { name: "New follower: Ada followed you" }));

    expect(onMarkRead).toHaveBeenCalledWith("unread-1");
  });

  it("marks all items read when requested", () => {
    const onMarkAllRead = jest.fn();
    render(<NotificationList notifications={notifications} onMarkAllRead={onMarkAllRead} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));

    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });
});
