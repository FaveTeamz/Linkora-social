import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, type AccessibilityRole } from "react-native";
import { useTheme } from "../theme/useTheme";

interface FeeTooltipProps {
  /** Protocol fee in basis points (e.g. 100 = 1 %). */
  feeBps?: number;
}

/**
 * FeeTooltip (React Native)
 *
 * Renders a small ⓘ info icon next to an amount label.  Tapping the icon
 * opens a centred modal tooltip that explains the platform-fee split.
 *
 * - Accessible: uses accessibilityRole="button" and accessibilityLabel.
 * - Colours come entirely from the Linkora theme token system.
 * - No external dependencies beyond React Native.
 */
export function FeeTooltip({ feeBps = 100 }: FeeTooltipProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [visible, setVisible] = useState(false);

  const feePercent = feeBps / 100;
  const creatorPercent = 100 - feePercent;

  return (
    <>
      {/* Trigger */}
      <Pressable
        onPress={() => setVisible(true)}
        accessibilityRole={"button" as AccessibilityRole}
        accessibilityLabel="Fee information"
        accessibilityHint="Shows platform fee and creator payout breakdown"
        style={styles.trigger}
      >
        <Text style={styles.triggerText}>ⓘ</Text>
      </Pressable>

      {/* Tooltip modal */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
        accessibilityViewIsModal
      >
        {/* Scrim — tapping outside dismisses */}
        <Pressable style={styles.scrim} onPress={() => setVisible(false)} accessible={false}>
          {/* Tooltip card — stop tap propagation */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={styles.card}
            accessibilityRole={"none" as AccessibilityRole}
          >
            <Text style={styles.title}>Fee Breakdown</Text>

            <View style={styles.row}>
              <Text style={styles.dot}>●</Text>
              <Text style={styles.label}>Platform fee:</Text>
              <Text style={styles.value}>{feePercent}%</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.dot}>●</Text>
              <Text style={styles.label}>Creator receives:</Text>
              <Text style={[styles.value, styles.creatorValue]}>{creatorPercent}%</Text>
            </View>

            <Pressable
              onPress={() => setVisible(false)}
              accessibilityRole={"button" as AccessibilityRole}
              accessibilityLabel="Dismiss tooltip"
              style={styles.dismissBtn}
            >
              <Text style={styles.dismissText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    trigger: {
      alignItems: "center",
      justifyContent: "center",
      width: 24,
      height: 24,
      marginLeft: 4,
    },
    triggerText: {
      color: theme.colors.brand.primary,
      fontSize: 16,
      lineHeight: 20,
    },
    scrim: {
      flex: 1,
      backgroundColor: theme.colors.overlay.scrim,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.lg,
    },
    card: {
      backgroundColor: theme.colors.surface.surface1,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.surface.border,
      padding: theme.spacing.md,
      width: "100%",
      maxWidth: 280,
      gap: theme.spacing.sm,
    },
    title: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    dot: {
      color: theme.colors.brand.primary,
      fontSize: 7,
      lineHeight: 14,
    },
    label: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      flex: 1,
    },
    value: {
      color: theme.colors.brand.secondary,
      fontSize: 14,
      fontWeight: "700",
    },
    creatorValue: {
      color: theme.colors.semantic.success,
    },
    dismissBtn: {
      alignItems: "center",
      justifyContent: "center",
      marginTop: theme.spacing.sm,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.brand.primary,
      alignSelf: "flex-end",
    },
    dismissText: {
      color: theme.colors.text.onBrand,
      fontSize: 13,
      fontWeight: "700",
    },
  });
}
