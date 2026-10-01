/**
 * useNotifications
 *
 * Loads notifications from the local SQLite cache, exposes a derived
 * unreadCount, and provides markAllRead() to flip every unread row to read.
 */

import { useEffect, useState, useCallback } from "react";
import { getNotifications, markAllNotificationsRead } from "../utils/db";

export interface Notification {
  id: string;
  type: string;
  body: string;
  /** 0 = unread, 1 = read */
  read: number;
  created_at: number;
}

export interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAllRead: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await getNotifications();
      setNotifications(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
  }, []);

  const unreadCount = notifications.filter((n) => n.read === 0).length;

  return { notifications, unreadCount, loading, error, markAllRead };
}
