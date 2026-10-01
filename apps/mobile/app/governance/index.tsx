/**
 * apps/mobile/app/governance/index.tsx
 *
 * Governance proposal list screen. Tapping a proposal card navigates to the
 * detail screen (governance/[id].tsx) using a shared-element transition driven
 * by react-native-reanimated 4.x `useSharedValue` + `Animated` components.
 *
 * The shared-element tag is `governance-card-{id}` and must match the
 * `sharedTransitionTag` used in [id].tsx.
 */

import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { SharedTransition, withSpring } from "react-native-reanimated";
import { useRouter } from "expo-router";

import { GovProposal, GovStatus, useGovernanceProposals } from "../../hooks/useGovernance";
import { useTheme } from "../../theme/useTheme";

// ---------------------------------------------------------------------------
// Shared-element transition config
// ---------------------------------------------------------------------------

/**
 * Custom spring transition shared between the list card and the detail hero
 * card so the motion feels snappy but not jarring.
 */
export const govCardTransition = SharedTransition.custom((values) => {
  "worklet";
  return {
    width: withSpring(values.targetWidth, { damping: 22, stiffness: 200 }),
    height: withSpring(values.targetHeight, { damping: 22, stiffness: 200 }),
    originX: withSpring(values.targetOriginX, { damping: 22, stiffness: 200 }),
    originY: withSpring(values.targetOriginY, { damping: 22, stiffness: 200 }),
  };
});

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusColor(status: GovStatus) {
  switch (status) {
    case "Active":
      return { bg: "rgba(124,58,237,0.18)", border: "#7C3AED", text: "#a78bfa" };
    case "Passed":
      return { bg: "rgba(16,185,129,0.15)", border: "#10B981", text: "#34d399" };
    case "Executed":
      return { bg: "rgba(100,116,139,0.18)", border: "#475569", text: "#94a3b8" };
  }
}

function StatusBadge({ status }: { status: GovStatus }) {
  const sc = statusColor(status);
  return (
    <View
      style={[
        govStyles.badge,
        { backgroundColor: sc.bg, borderColor: sc.border },
      ]}
      accessibilityLabel={`Status: ${status}`}
    >
      <Text style={[govStyles.badgeText, { color: sc.text }]}>{status}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quorum progress bar
// ---------------------------------------------------------------------------

function QuorumBar({
  votesFor,
  votesAgainst,
  quorum,
}: {
  votesFor: number;
  votesAgainst: number;
  quorum: number;
}) {
  const total = Math.max(votesFor + votesAgainst, 1);
  const forPct = Math.min((votesFor / total) * 100, 100);
  const quorumPct = quorum > 0 ? Math.min((total / quorum) * 100, 100) : 0;

  return (
    <View style={govStyles.quorumWrap}>
      {/* For / Against bar */}
      <View style={govStyles.voteBar}>
        <View style={[govStyles.voteBarFor, { width: `${forPct}%` }]} />
      </View>
      {/* Quorum reached indicator */}
      <Text style={govStyles.quorumLabel}>
        {Math.round(quorumPct)}% of quorum reached
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Proposal card
// ---------------------------------------------------------------------------

function ProposalCard({
  proposal,
  onPress,
}: {
  proposal: GovProposal;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${proposal.title}`}
    >
      {({ pressed }) => (
        <Animated.View
          sharedTransitionTag={`governance-card-${proposal.id}`}
          sharedTransitionStyle={govCardTransition}
          style={[
            govStyles.card,
            pressed && govStyles.cardPressed,
          ]}
        >
          <View style={govStyles.cardHeader}>
            <Text style={govStyles.cardTitle} numberOfLines={2}>
              {proposal.title}
            </Text>
            <StatusBadge status={proposal.status} />
          </View>

          <Text style={govStyles.cardDescription} numberOfLines={2}>
            {proposal.description}
          </Text>

          <QuorumBar
            votesFor={proposal.votes_for}
            votesAgainst={proposal.votes_against}
            quorum={proposal.effectiveQuorum}
          />

          <View style={govStyles.cardFooter}>
            <Text style={govStyles.voteCount}>
              <Text style={govStyles.forText}>For {fmtVotes(proposal.votes_for)}</Text>
              {"  ·  "}
              <Text style={govStyles.againstText}>
                Against {fmtVotes(proposal.votes_against)}
              </Text>
            </Text>
            <Text style={govStyles.ledgerText}>Ledger {proposal.created_ledger}</Text>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function GovernanceListScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { proposals, loading, error, refresh } = useGovernanceProposals();

  const activeCount = useMemo(
    () => proposals.filter((p) => p.status === "Active").length,
    [proposals]
  );

  const handleCardPress = (proposal: GovProposal) => {
    router.push(`/governance/${proposal.id}` as Parameters<typeof router.push>[0]);
  };

  if (loading) {
    return (
      <View style={[govStyles.container, govStyles.center]}>
        <ActivityIndicator size="large" color={theme.colors.brand.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[govStyles.container, govStyles.center]}>
        <Text style={govStyles.errorText}>{error}</Text>
        <TouchableOpacity
          style={govStyles.retryButton}
          onPress={refresh}
          accessibilityRole="button"
          accessibilityLabel="Retry loading proposals"
        >
          <Text style={govStyles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={govStyles.container}
      contentContainerStyle={govStyles.listContent}
      data={proposals}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={govStyles.header}>
          <Text style={govStyles.title}>Governance</Text>
          <Text style={govStyles.subtitle}>
            {activeCount > 0
              ? `${activeCount} active proposal${activeCount === 1 ? "" : "s"}`
              : "Participate in protocol parameter management."}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={govStyles.emptyContainer}>
          <Text style={govStyles.emptyIcon}>🗳️</Text>
          <Text style={govStyles.emptyTitle}>No proposals yet</Text>
          <Text style={govStyles.emptySubtitle}>
            Governance proposals will appear here once they are submitted to the protocol.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <ProposalCard proposal={item} onPress={() => handleCardPress(item)} />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtVotes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const govStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#F9FAFB",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    lineHeight: 20,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    padding: 16,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#F1F5F9",
    lineHeight: 20,
  },
  badge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  cardDescription: {
    fontSize: 13,
    color: "#94a3b8",
    lineHeight: 18,
    marginBottom: 12,
  },
  quorumWrap: {
    marginBottom: 10,
  },
  voteBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
    marginBottom: 4,
    overflow: "hidden",
  },
  voteBarFor: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  quorumLabel: {
    fontSize: 11,
    color: "#64748b",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  voteCount: {
    fontSize: 12,
    color: "#94a3b8",
  },
  forText: {
    color: "#34d399",
    fontWeight: "600",
  },
  againstText: {
    color: "#f87171",
    fontWeight: "600",
  },
  ledgerText: {
    fontSize: 11,
    color: "#475569",
    fontFamily: "monospace",
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#7C3AED",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F1F5F9",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
});
