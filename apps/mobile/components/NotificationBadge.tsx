import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../theme/useTheme";

export interface NotificationBadgeProps {
  /** Number of unread notifications. Renders nothing when 0. */
  count: number;
  testID?: string;
}

const MAX_COUNT = 99;

/**
 * A small numeric badge used to surface unread notification counts.
 *
 * - Returns `null` when `count` is 0 (nothing to show).
 * - Displays `"99+"` for any count above 99 to keep the badge compact.
 */
export function NotificationBadge({
  count,
  testID = "notification-badge",
}: NotificationBadgeProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (count <= 0) return null;

  const label = count > MAX_COUNT ? `${MAX_COUNT}+` : String(count);

  return (
    <View style={styles.badge} testID={testID} accessibilityLabel={`${count} unread notifications`}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    badge: {
      minWidth: 18,
      height: 18,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.semantic.error,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    label: {
      color: theme.colors.text.onBrand,
      fontSize: 11,
      fontWeight: "700",
      lineHeight: 14,
    },
  });
}
