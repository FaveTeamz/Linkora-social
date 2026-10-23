import { useCallback, useEffect, useRef, useState } from "react";
import {
  Notification,
  getCachedNotifications,
  getUnreadNotificationCount,
  initDatabase,
  markAllNotificationsRead,
  reconcileNotifications,
} from "../utils/db";
import { fetchNotifications, markAllNotificationsReadRemote } from "../services/notificationService";

export interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * Loads notifications from the local SQLite cache for instant display, then
 * syncs from the notification service in the background. Unread count is
 * derived from the local DB so no extra fetch is required.
 */
export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadFromCache = useCallback(async () => {
    const [cached, unread] = await Promise.all([
      getCachedNotifications(),
      getUnreadNotificationCount(),
    ]);
    if (!mountedRef.current) return;
    setNotifications(cached);
    setUnreadCount(unread);
  }, []);

  const syncFromService = useCallback(async () => {
    try {
      const remote = await fetchNotifications();
      await reconcileNotifications(remote);
      await loadFromCache();
      if (mountedRef.current) setError(null);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to sync notifications");
      }
    }
  }, [loadFromCache]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        await initDatabase();
        if (cancelled) return;
        await loadFromCache();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load notifications");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (cancelled) return;
      await syncFromService();
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [loadFromCache, syncFromService]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncFromService();
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [syncFromService]);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    await loadFromCache();
    try {
      await markAllNotificationsReadRemote();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to mark notifications read");
      }
    }
  }, [loadFromCache]);

  return { notifications, unreadCount, loading, refreshing, error, refresh, markAllRead };
}
