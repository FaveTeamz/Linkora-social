/**
 * TxToast — Stellar transaction status toast
 *
 * Implements a three-state machine:
 *
 *   pending  →  confirmed (success)
 *            →  failed    (error)
 *
 * Visual design per state
 * ──────────────────────
 *   pending   — left accent: brand.secondary (cyan)
 *               icon:  ActivityIndicator (spinner)
 *   confirmed — left accent: semantic.success (green)
 *               icon:  ✓ checkmark
 *   failed    — left accent: semantic.error (red)
 *               icon:  ✕ X mark
 *
 * Accessibility
 * ─────────────
 *   The animated container announces itself as a status region with
 *   `accessibilityLiveRegion="polite"` so screen-readers read the title
 *   aloud when it appears or when the state transitions.
 *
 * Auto-dismiss
 * ────────────
 *   Handled by the parent ToastContext.  The component emits
 *   `onPauseChange(true/false)` while the user's finger is down so the
 *   context can pause its timer.  Swipe distance > 60 dp triggers
 *   immediate dismissal via `onDismiss`.
 *
 * Usage:
 *   Controlled entirely through ToastContext helpers:
 *     showPending()           — show spinner
 *     showSuccess(txHash)     — transition to confirmed
 *     showError(message)      — transition to failed
 */
import React, { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ThemeTokens } from "../theme/tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

/** The three possible transaction states. */
export type TxToastKind = "pending" | "success" | "error";

export interface TxToastState {
  id: number;
  kind: TxToastKind;
  title: string;
  message?: string;
  txHash?: string;
}

interface TxToastProps {
  toast: TxToastState;
  onDismiss: () => void;
  /**
   * Called with `true` while the user is touching the toast (pauses the
   * parent's auto-dismiss timer) and `false` on release.
   */
  onPauseChange?: (paused: boolean) => void;
  theme: ThemeTokens;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

/** Resolve the left-accent colour for a given state. */
function accentColor(kind: TxToastKind, theme: ThemeTokens): string {
  switch (kind) {
    case "success":
      return theme.colors.semantic.success;
    case "error":
      return theme.colors.semantic.error;
    case "pending":
    default:
      return theme.colors.brand.secondary;
  }
}

/** Resolve the accessible state label for screen-readers. */
function stateLabel(kind: TxToastKind): string {
  switch (kind) {
    case "success":
      return "Transaction confirmed";
    case "error":
      return "Transaction failed";
    case "pending":
    default:
      return "Transaction pending";
  }
}

// ─── State icon ──────────────────────────────────────────────────────────────

interface StateIconProps {
  kind: TxToastKind;
  theme: ThemeTokens;
}

function StateIcon({ kind, theme }: StateIconProps) {
  if (kind === "pending") {
    return <ActivityIndicator color={theme.colors.brand.primary} size="small" />;
  }

  if (kind === "success") {
    return (
      <View
        style={[
          iconStyles.circle,
          { backgroundColor: theme.colors.semantic.successLight },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <Text style={[iconStyles.glyph, { color: theme.colors.semantic.success }]}>✓</Text>
      </View>
    );
  }

  // error / failed
  return (
    <View
      style={[iconStyles.circle, { backgroundColor: theme.colors.semantic.errorLight }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[iconStyles.glyph, { color: theme.colors.semantic.error }]}>✕</Text>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 18,
  },
});

// ─── TxToast ─────────────────────────────────────────────────────────────────

export function TxToast({ toast, onDismiss, onPauseChange, theme }: TxToastProps) {
  const translateY = useRef(new Animated.Value(-24)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const explorerUrl = useMemo(() => {
    if (!toast.txHash) return null;
    return `https://stellar.expert/explorer/public/tx/${encodeURIComponent(toast.txHash)}`;
  }, [toast.txHash]);

  // Slide in + fade in on mount
  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 15,
        mass: 0.8,
        stiffness: 180,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  // Swipe-to-dismiss pan responder
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 8 || Math.abs(gestureState.dx) > 8,
        onPanResponderMove: (_, gestureState) => {
          translateY.setValue(Math.max(-24, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 60 || Math.abs(gestureState.dx) > 60) {
            onDismiss();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 15,
            mass: 0.8,
            stiffness: 180,
          }).start();
        },
      }),
    [onDismiss, translateY]
  );

  return (
    <Animated.View
      testID="toast"
      // Announce state changes to screen-readers without interrupting the user
      accessibilityLiveRegion="polite"
      accessibilityRole="status"
      accessibilityLabel={`${stateLabel(toast.kind)}: ${toast.title}${toast.message ? `. ${toast.message}` : ""}`}
      style={[
        styles.toast,
        {
          backgroundColor: theme.colors.surface.surface1,
          borderColor: theme.colors.surface.border,
          transform: [{ translateY }],
          opacity,
        },
      ]}
      {...panResponder.panHandlers}
      onTouchStart={() => onPauseChange?.(true)}
      onTouchEnd={() => onPauseChange?.(false)}
      onTouchCancel={() => onPauseChange?.(false)}
    >
      {/* Left colour accent bar — colour varies per state */}
      <View
        style={[
          styles.accent,
          { backgroundColor: accentColor(toast.kind, theme) },
        ]}
      />

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>
            {toast.title}
          </Text>

          {/* Per-state icon: spinner | checkmark | X */}
          <StateIcon kind={toast.kind} theme={theme} />
        </View>

        {toast.message ? (
          <Text style={[styles.message, { color: theme.colors.text.secondary }]}>
            {toast.message}
          </Text>
        ) : null}

        {/* Explorer link — only on confirmed transactions */}
        {toast.kind === "success" && explorerUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open transaction on Stellar Expert"
            onPress={() => Linking.openURL(explorerUrl).catch(() => undefined)}
            style={styles.linkWrap}
          >
            <Text style={[styles.link, { color: theme.colors.brand.secondary }]}>
              {shortHash(toast.txHash ?? "")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Dismiss button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.dismiss, { color: theme.colors.text.secondary }]}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  accent: {
    width: 5,
    alignSelf: "stretch",
    borderRadius: 9999,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  linkWrap: {
    alignSelf: "flex-start",
  },
  link: {
    fontSize: 12,
    fontWeight: "700",
  },
  dismiss: {
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 2,
  },
});
