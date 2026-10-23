"use client";

import { useCallback, useEffect, useState } from "react";
import { useNotificationsContext } from "@/contexts/NotificationsContext";

const UNREAD_STORAGE_KEY = "linkora:notifications:unread";
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface UseNotificationBadgeOptions {
  pollIntervalMs?: number;
  /** Override the persisted-count refresh for hosts with a remote badge API. */
  fetchUnreadCount?: () => Promise<number>;
}

/** Keeps the navbar badge in sync with unread notifications persisted by the app. */
export function useNotificationBadge({
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  fetchUnreadCount,
}: UseNotificationBadgeOptions = {}) {
  const { markAllRead, resetUnread } = useNotificationsContext();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const count = fetchUnreadCount
        ? await fetchUnreadCount()
        : Number(window.localStorage.getItem(UNREAD_STORAGE_KEY) ?? 0);
      setUnreadCount(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    } catch {
      // Keep the last known badge value when a refresh fails.
    } finally {
      setIsLoading(false);
    }
  }, [fetchUnreadCount]);

  useEffect(() => {
    void refresh();
    if (pollIntervalMs <= 0) return;
    const timer = window.setInterval(() => void refresh(), pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [pollIntervalMs, refresh]);

  const markAllNotificationsRead = useCallback(() => {
    markAllRead();
    resetUnread();
    setUnreadCount(0);
  }, [markAllRead, resetUnread]);

  return { unreadCount, isLoading, markAllRead: markAllNotificationsRead, refresh };
}
