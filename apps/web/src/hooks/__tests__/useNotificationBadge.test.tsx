import { act, renderHook, waitFor } from "@testing-library/react";
import { useNotificationsContext } from "@/contexts/NotificationsContext";
import { useNotificationBadge } from "../useNotificationBadge";

jest.mock("@/contexts/NotificationsContext", () => ({
  useNotificationsContext: jest.fn(),
}));

const mockContext = useNotificationsContext as jest.MockedFunction<typeof useNotificationsContext>;

beforeEach(() => {
  window.localStorage.clear();
  mockContext.mockReturnValue({
    unreadCount: 0,
    incrementUnread: jest.fn(),
    decrementUnread: jest.fn(),
    resetUnread: jest.fn(),
    inboxUnreadCount: 0,
    actionNotifications: [],
    addNotification: jest.fn().mockReturnValue("id"),
    updateNotification: jest.fn(),
    getNotification: jest.fn(),
    notifications: [],
    hasMore: false,
    markAllRead: jest.fn(),
    loadMore: jest.fn(),
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("useNotificationBadge", () => {
  it("starts without a loading state and reads the persisted unread count", async () => {
    window.localStorage.setItem("linkora:notifications:unread", "4");
    const { result } = renderHook(() => useNotificationBadge({ pollIntervalMs: 0 }));

    expect(result.current.isLoading).toBe(false);
    await waitFor(() => expect(result.current.unreadCount).toBe(4));
  });

  it("clears the badge and notification state when marking all read", async () => {
    const resetUnread = jest.fn();
    const markAllRead = jest.fn();
    mockContext.mockReturnValue({ ...mockContext(), resetUnread, markAllRead });
    const { result } = renderHook(() => useNotificationBadge({ pollIntervalMs: 0 }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.markAllRead());

    expect(result.current.unreadCount).toBe(0);
    expect(resetUnread).toHaveBeenCalledTimes(1);
    expect(markAllRead).toHaveBeenCalledTimes(1);
  });

  it("refreshes the count on the configured polling interval", async () => {
    jest.useFakeTimers();
    const fetchUnreadCount = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(7);
    const { result } = renderHook(() =>
      useNotificationBadge({ pollIntervalMs: 1_000, fetchUnreadCount })
    );
    await act(async () => Promise.resolve());
    expect(result.current.unreadCount).toBe(2);

    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    expect(fetchUnreadCount).toHaveBeenCalledTimes(2);
    expect(result.current.unreadCount).toBe(7);
  });
});
