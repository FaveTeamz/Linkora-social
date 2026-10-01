import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import {
  NotificationDetailSheet,
  NotificationItem,
} from "../../components/NotificationDetailSheet";
import { useTheme } from "../../theme/useTheme";

// ---------------------------------------------------------------------------
// Stub data — replace with real API hook when the indexer exposes a
// notifications endpoint.
// ---------------------------------------------------------------------------
const STUB_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    message: "maya started following you.",
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    read: false,
    payload: {
      type: "NEW_FOLLOWER",
      followerAddress: "GCKFBEIYTKP6RCZNVPH73XL7XFWTEOAO4MKONX7HOILHDVBMW5EVPOPZ",
    },
  },
  {
    id: "n2",
    message: "atlas sent you a 50 XLM tip on your latest post.",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: false,
    payload: {
      type: "TIP_RECEIVED",
      senderAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
      amount: "50",
      asset: "XLM",
      postId: "post-abc-123",
    },
  },
  {
    id: "n3",
    message: "nova liked your post about creator economy.",
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    read: true,
    payload: {
      type: "LIKE_RECEIVED",
      senderAddress: "GDXU2G6VZLJIFRVDH5HLYCWJ2F64YQZH2TJUFDPBTZC53RIRZQJQ4LNK",
      postId: "post-xyz-456",
    },
  },
  {
    id: "n4",
    message: "There is new activity in the Creator Fund pool.",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    read: true,
    payload: {
      type: "POOL_ACTIVITY",
      poolId: "creator-fund",
      activityType: "deposit",
    },
  },
];

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
  const [notifications, setNotifications] = useState<NotificationItem[]>(STUB_NOTIFICATIONS);
  const [selected, setSelected] = useState<NotificationItem | null>(null);

  const handlePress = useCallback((item: NotificationItem) => {
    setSelected(item);
  }, []);

  const handleDismiss = useCallback(() => {
    setSelected(null);
  }, []);

  const handleMarkRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

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
