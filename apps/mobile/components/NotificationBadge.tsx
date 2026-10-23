import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "../theme/useTheme";

export interface NotificationBadgeProps {
  /** Number of unread notifications. Renders nothing when 0. */
  count: number;
  /** When true, the badge pulses to indicate unread items are being fetched. */
  isFetching?: boolean;
  testID?: string;
}

const MAX_COUNT = 99;

/**
 * A small numeric badge used to surface unread notification counts.
 *
 * - Scales in when `count` goes from 0 to N and scales out when it returns to 0.
 * - Pulses while `isFetching` is true to signal new unread items are loading.
 * - Displays `"99+"` for any count above 99 to keep the badge compact.
 */
export function NotificationBadge({
  count,
  isFetching = false,
  testID = "notification-badge",
}: NotificationBadgeProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const scale = useSharedValue(count > 0 ? 1 : 0);
  const opacity = useSharedValue(count > 0 ? 1 : 0);

  useEffect(() => {
    if (count > 0) {
      scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.back(1.5)) });
      opacity.value = withTiming(1, { duration: 150 });
    } else {
      scale.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.ease) });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [count, opacity, scale]);

  useEffect(() => {
    if (isFetching && count > 0) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else if (count > 0) {
      scale.value = withTiming(1, { duration: 150 });
    }
  }, [isFetching, count, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (count <= 0) return null;

  const label = count > MAX_COUNT ? `${MAX_COUNT}+` : String(count);

  return (
    <Animated.View
      style={[styles.badge, animatedStyle]}
      testID={testID}
      accessibilityLabel={`${count} unread notifications`}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
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
