/**
 * useNotifications.test.ts  (#164)
 *
 * Acceptance criteria:
 *  1. loads from SQLite on mount
 *  2. markAllRead updates local state
 *  3. error state on DB failure
 *  4. unreadCount derived correctly from notifications list
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";

// ---------------------------------------------------------------------------
// Mock the db module so we control what getNotifications / markAllNotificationsRead
// return without touching expo-sqlite at all.
// ---------------------------------------------------------------------------

const mockGetNotifications = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();

jest.mock("../../utils/db", () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
}));

import { useNotifications, Notification } from "../useNotifications";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotifications(rows: Array<Partial<Notification> & { id: string }>): Notification[] {
  return rows.map((r) => ({
    type: r.type ?? "tip",
    body: r.body ?? "notification body",
    read: r.read ?? 0,
    created_at: r.created_at ?? 1000,
    ...r,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useNotifications (#164)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkAllNotificationsRead.mockResolvedValue(undefined);
  });

  // ── 1. Loads from SQLite on mount ─────────────────────────────────────────

  it("loads notifications from SQLite on mount", async () => {
    const rows = makeNotifications([
      { id: "n1", type: "tip", body: "You received a tip", read: 0, created_at: 1000 },
      { id: "n2", type: "follow", body: "Someone followed you", read: 1, created_at: 900 },
    ]);
    mockGetNotifications.mockResolvedValueOnce(rows);

    const { result } = renderHook(() => useNotifications());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.notifications[0].id).toBe("n1");
    expect(result.current.notifications[1].id).toBe("n2");
    expect(result.current.error).toBeNull();
    expect(mockGetNotifications).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when the DB has no notifications", async () => {
    mockGetNotifications.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  // ── 2. markAllRead updates local state ───────────────────────────────────

  it("markAllRead sets every notification's read flag to 1 in local state", async () => {
    const rows = makeNotifications([
      { id: "n1", type: "tip", body: "Tip received", read: 0, created_at: 1000 },
      { id: "n2", type: "follow", body: "New follower", read: 0, created_at: 800 },
      { id: "n3", type: "like", body: "Post liked", read: 1, created_at: 600 },
    ]);
    mockGetNotifications.mockResolvedValueOnce(rows);

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications.filter((n) => n.read === 0)).toHaveLength(2);

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(result.current.notifications.every((n) => n.read === 1)).toBe(true);
  });

  it("markAllRead calls markAllNotificationsRead on the DB", async () => {
    mockGetNotifications.mockResolvedValueOnce(makeNotifications([{ id: "n1", read: 0 }]));

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(mockMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it("markAllRead does not mutate already-read notifications", async () => {
    const rows = makeNotifications([
      { id: "n1", read: 1, created_at: 1000 },
      { id: "n2", read: 0, created_at: 900 },
    ]);
    mockGetNotifications.mockResolvedValueOnce(rows);

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markAllRead();
    });

    // All notifications must be read=1 after calling markAllRead
    expect(result.current.notifications.every((n) => n.read === 1)).toBe(true);
  });

  // ── 3. Error state on DB failure ─────────────────────────────────────────

  it("sets error state when the DB throws on load", async () => {
    mockGetNotifications.mockRejectedValueOnce(new Error("disk I/O error"));

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("disk I/O error");
    expect(result.current.notifications).toEqual([]);
  });

  it("sets a generic error message when DB throws a non-Error value", async () => {
    mockGetNotifications.mockRejectedValueOnce("unexpected failure");

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load notifications");
  });

  // ── 4. unreadCount derived correctly ─────────────────────────────────────

  it("computes unreadCount as the number of notifications where read === 0", async () => {
    const rows = makeNotifications([
      { id: "n1", read: 0, created_at: 1000 },
      { id: "n2", read: 0, created_at: 900 },
      { id: "n3", read: 1, created_at: 800 },
    ]);
    mockGetNotifications.mockResolvedValueOnce(rows);

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unreadCount).toBe(2);
  });

  it("reports unreadCount of 0 when all notifications are read", async () => {
    const rows = makeNotifications([
      { id: "n1", read: 1, created_at: 1000 },
      { id: "n2", read: 1, created_at: 900 },
    ]);
    mockGetNotifications.mockResolvedValueOnce(rows);

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unreadCount).toBe(0);
  });

  it("unreadCount drops to 0 after markAllRead", async () => {
    const rows = makeNotifications([
      { id: "n1", read: 0, created_at: 1000 },
      { id: "n2", read: 0, created_at: 900 },
    ]);
    mockGetNotifications.mockResolvedValueOnce(rows);

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unreadCount).toBe(2);

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
  });

  it("reports unreadCount of 0 when there are no notifications", async () => {
    mockGetNotifications.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unreadCount).toBe(0);
  });
});
