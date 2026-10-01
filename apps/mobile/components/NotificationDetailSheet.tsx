import React, { useCallback, useMemo, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";

import { useTheme } from "../theme/useTheme";
import type { NotificationPayload } from "../notifications/notificationHandler";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationItem {
  /** Unique identifier for the notification. */
  id: string;
  /** Full human-readable message body. */
  message: string;
  /** ISO timestamp string. */
  timestamp: string;
  /** Whether this notification has been read. */
  read: boolean;
  /** Structured payload used to build the action button route. */
  payload: NotificationPayload;
}

interface NotificationDetailSheetProps {
  /** The notification to display. Pass `null` to keep the sheet closed. */
  notification: NotificationItem | null;
  /** Called when the sheet is dismissed (swipe-down or backdrop tap). */
  onDismiss: () => void;
  /** Called when the notification is marked read. Fires on sheet open. */
  onMarkRead: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function actorRoute(payload: NotificationPayload): string | null {
  const addr = payload.followerAddress ?? payload.senderAddress;
  return addr ? `/profile/${addr}` : null;
}

function actionRoute(payload: NotificationPayload): string | null {
  switch (payload.type) {
    case "NEW_FOLLOWER":
      return payload.followerAddress ? `/profile/${payload.followerAddress}` : null;
    case "TIP_RECEIVED":
    case "LIKE_RECEIVED":
    case "POST_REPORTED":
    case "REPORT_DISMISSED":
    case "POST_REMOVED_BY_MODERATION":
      return payload.postId ? `/post/${payload.postId}` : null;
    case "POOL_ACTIVITY":
      return payload.poolId ? `/pools/${payload.poolId}` : null;
    default:
      return null;
  }
}

function actionLabel(payload: NotificationPayload): string {
  switch (payload.type) {
    case "NEW_FOLLOWER":
      return "View profile";
    case "TIP_RECEIVED":
    case "LIKE_RECEIVED":
      return "View post";
    case "POST_REPORTED":
    case "REPORT_DISMISSED":
    case "POST_REMOVED_BY_MODERATION":
      return "View post";
    case "POOL_ACTIVITY":
      return "View pool";
    default:
      return "View";
  }
}

function typeLabel(type: NotificationPayload["type"]): string {
  switch (type) {
    case "NEW_FOLLOWER":
      return "New follower";
    case "TIP_RECEIVED":
      return "Tip received";
    case "LIKE_RECEIVED":
      return "Post liked";
    case "POOL_ACTIVITY":
      return "Pool activity";
    case "POST_REPORTED":
      return "Post reported";
    case "REPORT_DISMISSED":
      return "Report dismissed";
    case "POST_REMOVED_BY_MODERATION":
      return "Post removed";
    default:
      return "Notification";
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * NotificationDetailSheet — a @gorhom/bottom-sheet that opens when the user
 * taps a notification row.
 *
 * Acceptance criteria:
 * - Opens on notification tap
 * - Shows: full message, actor profile link, action button (view post/proposal/profile)
 * - Swipe-down to dismiss
 * - Marks notification as read on open
 */
export function NotificationDetailSheet({
  notification,
  onDismiss,
  onMarkRead,
}: NotificationDetailSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["45%"], []);

  // Mark as read as soon as the sheet opens (onChange index 0 = open)
  const handleChange = useCallback(
    (index: number) => {
      if (index === 0 && notification && !notification.read) {
        onMarkRead(notification.id);
      }
      if (index === -1) {
        onDismiss();
      }
    },
    [notification, onDismiss, onMarkRead]
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    []
  );

  // Open/close by expanding/collapsing based on whether notification is set
  const isOpen = notification !== null;

  // Imperatively snap when the notification prop changes
  React.useEffect(() => {
    if (isOpen) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen, notification?.id]);

  const actorPath = notification ? actorRoute(notification.payload) : null;
  const actionPath = notification
    ? (notification.payload.deepLink ?? actionRoute(notification.payload))
    : null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onChange={handleChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.colors.surface.surface1 }}
      handleIndicatorStyle={{ backgroundColor: theme.colors.surface.border }}
    >
      <BottomSheetView style={styles.content}>
        {notification ? (
          <>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.typeLabel}>{typeLabel(notification.payload.type)}</Text>
              <Text style={styles.timestamp}>{formatTimestamp(notification.timestamp)}</Text>
            </View>

            {/* Full message */}
            <Text style={styles.message}>{notification.message}</Text>

            {/* Actor profile link */}
            {actorPath ? (
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => {
                  router.push(actorPath as Parameters<typeof router.push>[0]);
                  onDismiss();
                }}
                accessibilityRole="link"
                accessibilityLabel="View actor profile"
              >
                <Text style={styles.linkText}>View profile →</Text>
              </TouchableOpacity>
            ) : null}

            {/* Primary action button */}
            {actionPath ? (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.brand.primary }]}
                onPress={() => {
                  router.push(actionPath as Parameters<typeof router.push>[0]);
                  onDismiss();
                }}
                accessibilityRole="button"
                accessibilityLabel={actionLabel(notification.payload)}
              >
                <Text style={styles.actionButtonText}>{actionLabel(notification.payload)}</Text>
              </TouchableOpacity>
            ) : null}

            {/* Dismiss */}
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss notification detail"
            >
              <Text style={[styles.dismissText, { color: theme.colors.text.secondary }]}>
                Dismiss
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    content: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 32,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    typeLabel: {
      color: theme.colors.brand.primary,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    timestamp: {
      color: theme.colors.text.secondary,
      fontSize: 11,
    },
    message: {
      color: theme.colors.text.primary,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 20,
    },
    linkRow: {
      marginBottom: 12,
    },
    linkText: {
      color: theme.colors.brand.primary,
      fontSize: 14,
      fontWeight: "600",
    },
    actionButton: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      marginBottom: 12,
    },
    actionButtonText: {
      color: theme.colors.text.onBrand,
      fontSize: 15,
      fontWeight: "700",
    },
    dismissButton: {
      alignItems: "center",
      paddingVertical: 8,
    },
    dismissText: {
      fontSize: 14,
      fontWeight: "500",
    },
  });
}
