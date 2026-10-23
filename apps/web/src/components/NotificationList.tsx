"use client";

import { useState } from "react";

export type NotificationKind = "follow" | "like" | "tip" | "governance" | "mention" | "comment";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  message: string;
  actor?: string;
  timestamp: string;
  read: boolean;
  href?: string;
}

interface NotificationListProps {
  notifications: NotificationItem[];
  isLoading?: boolean;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  /** Maximum items to show before a "Load more" prompt. */
  pageSize?: number;
}

const KIND_ICONS: Record<NotificationKind, string> = {
  follow: "👤",
  like: "❤️",
  tip: "💰",
  governance: "🗳️",
  mention: "💬",
  comment: "🗨️",
};

const KIND_LABELS: Record<NotificationKind, string> = {
  follow: "New follower",
  like: "Post liked",
  tip: "Tip received",
  governance: "Governance",
  mention: "Mention",
  comment: "Comment",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * NotificationList — a scrollable list of in-app notifications.
 *
 * All colours reference CSS custom property tokens (var(--foreground), etc.)
 * so the component automatically adapts to light and dark themes.
 */
export function NotificationList({
  notifications,
  isLoading = false,
  onMarkRead,
  onMarkAllRead,
  pageSize = 20,
}: NotificationListProps) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const visible = notifications.slice(0, visibleCount);
  const hasUnread = notifications.some((n) => !n.read);
  const hasMore = visibleCount < notifications.length;

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading notifications" className="flex justify-center py-12">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-6 py-12 text-center">
        <p className="text-sm text-[var(--text-muted)]">No notifications yet.</p>
      </div>
    );
  }

  return (
    <section aria-label="Notifications">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--foreground)]">Notifications</h2>
        {hasUnread && onMarkAllRead && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <ul className="flex flex-col gap-2" role="list">
        {visible.map((notification) => (
          <li key={notification.id}>
            <NotificationRow notification={notification} onMarkRead={onMarkRead} />
          </li>
        ))}
      </ul>

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + pageSize)}
            className="rounded-lg border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text-muted)] hover:border-violet-500/60 hover:text-violet-400 transition-colors"
          >
            Load more
          </button>
        </div>
      )}
    </section>
  );
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: NotificationItem;
  onMarkRead?: (id: string) => void;
}) {
  const handleActivate = () => {
    if (!notification.read) onMarkRead?.(notification.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
      className={`flex cursor-pointer items-start gap-4 rounded-xl border px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ${
        notification.read
          ? "border-[var(--border)] bg-[var(--muted)] hover:bg-[var(--bg-tertiary)]"
          : "border-violet-700/50 bg-violet-900/20 hover:bg-violet-900/30"
      }`}
      aria-label={`${KIND_LABELS[notification.kind]}: ${notification.message}`}
    >
      {/* Unread indicator */}
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          notification.read ? "bg-transparent" : "bg-violet-500"
        }`}
        aria-hidden="true"
      />

      {/* Kind icon */}
      <span className="shrink-0 text-lg" aria-hidden="true">
        {KIND_ICONS[notification.kind]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--foreground)]">{notification.message}</p>
        <time
          className="text-xs text-[var(--text-muted)]"
          dateTime={notification.timestamp}
        >
          {formatTime(notification.timestamp)}
        </time>
      </div>
    </div>
  );
}
