import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../theme/useTheme";

/** Ordered tiers from lowest to highest reputation. */
export type ReputationTier = "newcomer" | "member" | "trusted" | "verified" | "legend";

export interface ReputationBadgeProps {
  tier: ReputationTier;
  testID?: string;
}

interface TierMeta {
  label: string;
  emoji: string;
  /** Resolved at render time from the theme. */
  getColor: (theme: ReturnType<typeof useTheme>["theme"]) => string;
  getBackground: (theme: ReturnType<typeof useTheme>["theme"]) => string;
}

const TIER_META: Record<ReputationTier, TierMeta> = {
  newcomer: {
    label: "Newcomer",
    emoji: "🌱",
    getColor: (t) => t.colors.text.secondary,
    getBackground: (t) => t.colors.surface.surface2,
  },
  member: {
    label: "Member",
    emoji: "⭐",
    getColor: (t) => t.colors.brand.secondary,
    getBackground: (t) => t.colors.brand.secondaryLight,
  },
  trusted: {
    label: "Trusted",
    emoji: "🔵",
    getColor: (t) => t.colors.semantic.info,
    getBackground: (t) => t.colors.semantic.infoLight,
  },
  verified: {
    label: "Verified",
    emoji: "✅",
    getColor: (t) => t.colors.semantic.success,
    getBackground: (t) => t.colors.semantic.successLight,
  },
  legend: {
    label: "Legend",
    emoji: "🏆",
    getColor: (t) => t.colors.brand.accent,
    getBackground: (t) => t.colors.brand.primaryLight,
  },
};

/**
 * Displays a creator's reputation tier as a compact pill badge.
 */
export function ReputationBadge({ tier, testID = "reputation-badge" }: ReputationBadgeProps) {
  const { theme } = useTheme();
  const meta = TIER_META[tier];
  const styles = useMemo(() => createStyles(theme, meta), [theme, meta]);

  return (
    <View
      style={styles.badge}
      testID={testID}
      accessibilityLabel={`Reputation tier: ${meta.label}`}
    >
      <Text style={styles.emoji}>{meta.emoji}</Text>
      <Text style={styles.label}>{meta.label}</Text>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>["theme"], meta: TierMeta) {
  return StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      borderRadius: theme.radius.full,
      backgroundColor: meta.getBackground(theme),
      paddingVertical: 2,
      paddingHorizontal: theme.spacing.sm,
      gap: 4,
    },
    emoji: {
      fontSize: 12,
      lineHeight: 16,
    },
    label: {
      color: meta.getColor(theme),
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 16,
    },
  });
}
