import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import {
  NotificationDetailSheet,
  NotificationItem,
} from "../../components/NotificationDetailSheet";
import { useNotifications } from "../../hooks/useNotifications";
import { useTheme } from "../../theme/useTheme";

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

interface NotificationRowProps {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}

function NotificationRow({ item, onPress }: NotificationRowProps) {
  const { theme } = useTheme();

  const rowStyles = useMemo(
    () => ({
      row: [
        styles.row,
        {
          backgroundColor: item.read
            ? theme.colors.surface.background
            : theme.colors.surface.surface1,
          borderBottomColor: theme.colors.surface.border,
        },
      ] as const,
      dot: [
        styles.dot,
        {
          backgroundColor: item.read ? "transparent" : theme.colors.brand.primary,
        },
      ] as const,
      message: [
        styles.message,
        {
          color: theme.colors.text.primary,
          fontWeight: item.read ? ("400" as const) : ("700" as const),
        },
      ] as const,
      time: { color: theme.colors.text.secondary } as const,
    }),
    [item.read, theme]
  );

  return (
    <TouchableOpacity
      style={rowStyles.row}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`Notification: ${item.message}`}
      testID={`notification-row-${item.id}`}
    >
      <View style={rowStyles.dot} />
      <View style={styles.rowContent}>
        <Text style={rowStyles.message} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={[styles.time, rowStyles.time]}>{formatRelativeTime(item.timestamp)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [selected, setSelected] = useState<NotificationItem | null>(null);

  const handlePress = useCallback((item: NotificationItem) => {
    setSelected(item);
  }, []);

  const handleDismiss = useCallback(() => {
    setSelected(null);
  }, []);

  const handleMarkRead = useCallback(
    (id: string) => {
      void markRead(id);
    },
    [markRead]
  );

  const handleMarkAllRead = useCallback(() => {
    void markAllRead();
  }, [markAllRead]);

  return (
    // GestureHandlerRootView is required by @gorhom/bottom-sheet
    <GestureHandlerRootView
      style={[styles.root, { backgroundColor: theme.colors.surface.background }]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text.primary }]}>Notifications</Text>
        {unreadCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.colors.brand.primary }]}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        ) : null}
        {unreadCount > 0 ? (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={handleMarkAllRead}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            testID="notifications-mark-all-read"
          >
            <Text style={[styles.markAllText, { color: theme.colors.brand.primary }]}>
              Mark all read
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationRow item={item} onPress={handlePress} />}
        contentContainerStyle={styles.list}
      />

      {/* Bottom sheet — rendered outside the FlatList so it overlays correctly */}
      <NotificationDetailSheet
        notification={selected}
        onDismiss={handleDismiss}
        onMarkRead={handleMarkRead}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  markAllButton: {
    marginLeft: "auto",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: "600",
  },
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  rowContent: {
    flex: 1,
    gap: 4,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  time: {
    fontSize: 11,
  },
});
