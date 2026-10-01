"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useNotificationsContext } from "@/contexts/NotificationsContext";
import { useWalletContext } from "@/components/WalletProvider";

export type { NotificationType, Notification } from "@/contexts/NotificationsContext";

const LS_NOTIFICATIONS_KEY = "linkora:notifications:items";
const PAGE_SIZE = 10;

function loadStored(address: string) {
  try {
    const raw = localStorage.getItem(`${LS_NOTIFICATIONS_KEY}:${address}`);
    if (!raw) return [];
    return JSON.parse(raw) as import("@/contexts/NotificationsContext").Notification[];
  } catch {
    return [];
  }
}

function persist(
  address: string,
  items: import("@/contexts/NotificationsContext").Notification[]
): void {
  localStorage.setItem(`${LS_NOTIFICATIONS_KEY}:${address}`, JSON.stringify(items));
}

/**
 * Thin consumer over the canonical NotificationsProvider.
 *
 * All notification state (including the indexer WebSocket feed) now lives in
 * `NotificationsContext`, so this hook lets existing callers keep reading the
 * inbox without owning their own copy of the data.
 */
export function useNotifications() {
  const { address } = useWalletContext();
  const { incrementUnread, decrementUnread, resetUnread } = useNotificationsContext();
  const [notifications, setNotifications] = useState<
    import("@/contexts/NotificationsContext").Notification[]
  >([]);
  const [page, setPage] = useState(1);
  const addressRef = useRef<string | null>(null);

  useEffect(() => {
    if (!address) {
      setNotifications([]);
      addressRef.current = null;
      return;
    }
    setNotifications(loadStored(address));
    addressRef.current = address;
  }, [address]);

  const markAllRead = useCallback(() => {
    if (!addressRef.current) return;
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      persist(addressRef.current!, next);
      return next;
    });
    resetUnread();
  }, [resetUnread]);

  /**
   * Mark a single notification as read and keep the global unread counter in
   * sync. Unread state is preserved until the user explicitly reads an item
   * (or uses "Mark all read"); it is never cleared just by visiting the page.
   */
  const markRead = useCallback(
    (id: string) => {
      if (!addressRef.current) return;
      const target = notifications.find((n) => n.id === id);
      if (target?.read) return;

      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        persist(addressRef.current!, next);
        return next;
      });
      decrementUnread();
    },
    [decrementUnread, notifications]
  );

  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const visibleNotifications = notifications.slice(0, page * PAGE_SIZE);
  const hasMore = notifications.length > page * PAGE_SIZE;
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Expose incrementUnread for any callers that need to manually bump the badge
  const addNotification = useCallback(
    (n: import("@/contexts/NotificationsContext").Notification) => {
      if (!addressRef.current) return;
      setNotifications((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        const next = [n, ...prev].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        persist(addressRef.current!, next);
        return next;
      });
      incrementUnread();
    },
    [incrementUnread]
  );

  return {
    notifications: visibleNotifications,
    hasMore,
    unreadCount,
    markAllRead,
    markRead,
    loadMore,
    addNotification,
  };
}
