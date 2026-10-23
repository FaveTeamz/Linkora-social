import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";

import { useTheme } from "../theme/useTheme";
import { useReputation, type ReputationSignal } from "../hooks/useReputation";

/** Ordered tiers from lowest to highest reputation. */
export type ReputationTier = "newcomer" | "member" | "trusted" | "verified" | "legend";

export interface ReputationBadgeProps {
  tier: ReputationTier;
  /** Raw reputation score used for the breakdown sheet. */
  score?: number;
  /** Signals contributing to the score, shown in the breakdown sheet. */
  signals?: ReputationSignal[];
  testID?: string;
}

interface TierMeta {
  label: string;
  emoji: string;
  /** Resolved at render time from the theme. */
  getColor: (theme: ReturnType<typeof useTheme>["theme"]) => string;
  getBackground: (theme: ReturnType<typeof useTheme>["theme"]>) => string;
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
 * Pressing the badge opens a bottom sheet with the score breakdown.
 */
export function ReputationBadge({
  tier,
  score = 0,
  signals = [],
  testID = "reputation-badge",
}: ReputationBadgeProps) {
  const { theme } = useTheme();
  const meta = TIER_META[tier];
  const styles = useMemo(() => createStyles(theme, meta), [theme, meta]);
  const breakdown = useReputation(score, signals);

  const sheetRef = useRef<BottomSheet>(null);
  const [open, setOpen] = useState(false);
  const snapPoints = useMemo(() => ["45%", "75%"], []);

  const handleOpen = useCallback(() => {
    setOpen(true);
    sheetRef.current?.snapToIndex(0);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    sheetRef.current?.close();
  }, []);

  return (
    <>
      <Pressable
        style={styles.badge}
        testID={testID}
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={`Reputation tier: ${meta.label}. Score ${breakdown.score}. Tap for breakdown.`}
        accessibilityHint="Opens reputation score breakdown"
      >
        <Text style={styles.emoji}>{meta.emoji}</Text>
        <Text style={styles.label}>{meta.label}</Text>
      </Pressable>

      {open ? (
        <BottomSheet
          ref={sheetRef}
          index={0}
          snapPoints={snapPoints}
          enablePanDownToClose
          onClose={handleClose}
          backgroundStyle={{ backgroundColor: theme.colors.surface.surface1 }}
          handleIndicatorStyle={{ backgroundColor: theme.colors.text.secondary }}
        >
          <BottomSheetView
            style={styles.sheetContent}
            accessibilityRole="summary"
            accessibilityLabel={`Reputation breakdown. Score ${breakdown.score}, tier ${meta.label}, percentile ${breakdown.percentile}.`}
          >
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Reputation Breakdown
            </Text>

            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{breakdown.score}</Text>
                <Text style={styles.statLabel}>Score</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{meta.label}</Text>
                <Text style={styles.statLabel}>Tier</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{breakdown.percentile}%</Text>
                <Text style={styles.statLabel}>Percentile</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle} accessibilityRole="header">
              Top Signals
            </Text>
            {breakdown.topSignals.length === 0 ? (
              <Text style={styles.emptyText}>No signals yet.</Text>
            ) : (
              breakdown.topSignals.map((signal) => (
                <View key={signal.id} style={styles.signalRow}>
                  <Text style={styles.signalLabel}>{signal.label}</Text>
                  <Text style={styles.signalWeight}>+{signal.weight}</Text>
                </View>
              ))
            )}
          </BottomSheetView>
        </BottomSheet>
      ) : null}
    </>
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
    sheetContent: {
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    sheetTitle: {
      color: theme.colors.text.primary,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: theme.spacing.sm,
    },
    statRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    stat: {
      flex: 1,
      alignItems: "center",
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surface.surface2,
      paddingVertical: theme.spacing.sm,
      gap: 2,
    },
    statValue: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: "700",
    },
    statLabel: {
      color: theme.colors.text.secondary,
      fontSize: 12,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: "600",
      marginTop: theme.spacing.md,
    },
    signalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: theme.spacing.xs,
    },
    signalLabel: {
      color: theme.colors.text.primary,
      fontSize: 14,
    },
    signalWeight: {
      color: theme.colors.semantic.success,
      fontSize: 14,
      fontWeight: "600",
    },
    emptyText: {
      color: theme.colors.text.secondary,
      fontSize: 14,
    },
  });
}
