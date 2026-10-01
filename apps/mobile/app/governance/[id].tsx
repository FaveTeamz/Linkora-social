/**
 * apps/mobile/app/governance/[id].tsx
 *
 * Governance proposal detail screen.
 *
 * Features:
 *  • Title, description, quorum progress bar, and vote breakdown
 *  • Vote For / Vote Against buttons for Active proposals (wallet-connected)
 *  • Animated shared-element transition from the list card using
 *    react-native-reanimated 4.x SharedTransition API
 *
 * The `sharedTransitionTag` on the hero card must match the tag used in
 * `governance/index.tsx` for the pressed card, i.e. `governance-card-{id}`.
 */

import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  SharedTransition,
  withSpring,
} from "react-native-reanimated";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import {
  castVote,
  GovProposal,
  GovStatus,
  useGovernanceProposal,
} from "../../hooks/useGovernance";
import { useWallet } from "../../hooks/useWallet";
import { useTheme } from "../../theme/useTheme";

// ---------------------------------------------------------------------------
// Shared-element transition (must match index.tsx)
// ---------------------------------------------------------------------------

const govCardTransition = SharedTransition.custom((values) => {
  "worklet";
  return {
    width: withSpring(values.targetWidth, { damping: 22, stiffness: 200 }),
    height: withSpring(values.targetHeight, { damping: 22, stiffness: 200 }),
    originX: withSpring(values.targetOriginX, { damping: 22, stiffness: 200 }),
    originY: withSpring(values.targetOriginY, { damping: 22, stiffness: 200 }),
  };
});

// ---------------------------------------------------------------------------
// Status colours
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: GovStatus }) {
  const sc = statusColor(status);
  return (
    <View
      style={[detailStyles.badge, { backgroundColor: sc.bg, borderColor: sc.border }]}
      accessibilityLabel={`Status: ${status}`}
    >
      <Text style={[detailStyles.badgeText, { color: sc.text }]}>{status}</Text>
    </View>
  );
}

/**
 * Circular / arc quorum indicator built with plain React Native so we keep
 * the dependency surface minimal (no extra chart library needed).
 */
function QuorumProgress({
  votesFor,
  votesAgainst,
  quorum,
}: {
  votesFor: number;
  votesAgainst: number;
  quorum: number;
}) {
  const total = votesFor + votesAgainst;
  const quorumPct = quorum > 0 ? Math.min((total / quorum) * 100, 100) : 0;
  const forPct = total > 0 ? Math.round((votesFor / total) * 100) : 0;

  return (
    <View style={detailStyles.quorumCard}>
      <Text style={detailStyles.sectionTitle}>Quorum Progress</Text>

      {/* Quorum track */}
      <View style={detailStyles.quorumTrack}>
        <Animated.View
          entering={FadeInDown.delay(150).duration(400)}
          style={[detailStyles.quorumFill, { width: `${quorumPct}%` }]}
        />
      </View>
      <View style={detailStyles.quorumLabelsRow}>
        <Text style={detailStyles.quorumPct}>{Math.round(quorumPct)}% reached</Text>
        <Text style={detailStyles.quorumTarget}>
          {fmtVotes(total)} / {fmtVotes(quorum)} needed
        </Text>
      </View>

      {/* For / Against breakdown */}
      <View style={detailStyles.splitTrack}>
        <Animated.View
          entering={FadeInDown.delay(250).duration(400)}
          style={[detailStyles.splitFor, { width: `${forPct}%` }]}
        />
      </View>
      <View style={detailStyles.splitLabels}>
        <View style={detailStyles.splitLabelGroup}>
          <View style={[detailStyles.dot, { backgroundColor: "#10B981" }]} />
          <Text style={detailStyles.splitFor_label}>
            For · {fmtVotes(votesFor)} ({forPct}%)
          </Text>
        </View>
        <View style={detailStyles.splitLabelGroup}>
          <View style={[detailStyles.dot, { backgroundColor: "#EF4444" }]} />
          <Text style={detailStyles.splitAgainst_label}>
            Against · {fmtVotes(votesAgainst)} ({100 - forPct}%)
          </Text>
        </View>
      </View>
    </View>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={detailStyles.metaRow}>
      <Text style={detailStyles.metaLabel}>{label}</Text>
      <Text style={[detailStyles.metaValue, mono && detailStyles.mono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Vote buttons
// ---------------------------------------------------------------------------

function VoteButtons({
  proposalId,
  voterAddress,
  onVoteSuccess,
}: {
  proposalId: string;
  voterAddress: string;
  onVoteSuccess: () => void;
}) {
  const [voting, setVoting] = useState<"for" | "against" | null>(null);

  const handleVote = async (support: boolean) => {
    const label = support ? "for" : "against";
    Alert.alert(
      "Confirm Vote",
      `Vote ${label} proposal #${proposalId}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Vote ${support ? "For" : "Against"}`,
          style: support ? "default" : "destructive",
          onPress: async () => {
            setVoting(support ? "for" : "against");
            try {
              await castVote(proposalId, support, voterAddress);
              onVoteSuccess();
              Alert.alert("Vote submitted", `Your vote has been recorded.`);
            } catch (err) {
              Alert.alert(
                "Vote failed",
                err instanceof Error ? err.message : "Please try again."
              );
            } finally {
              setVoting(null);
            }
          },
        },
      ]
    );
  };

  return (
    <Animated.View entering={FadeInUp.delay(200).duration(350)} style={detailStyles.voteRow}>
      <TouchableOpacity
        style={[detailStyles.voteBtn, detailStyles.voteBtnFor]}
        onPress={() => handleVote(true)}
        disabled={voting !== null}
        accessibilityRole="button"
        accessibilityLabel="Vote for this proposal"
      >
        {voting === "for" ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={detailStyles.voteBtnText}>✓ Vote For</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[detailStyles.voteBtn, detailStyles.voteBtnAgainst]}
        onPress={() => handleVote(false)}
        disabled={voting !== null}
        accessibilityRole="button"
        accessibilityLabel="Vote against this proposal"
      >
        {voting === "against" ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={detailStyles.voteBtnText}>✗ Vote Against</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function GovernanceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const router = useRouter();
  const { address, connected } = useWallet();

  const { proposal, loading, error, refresh } = useGovernanceProposal(
    Array.isArray(id) ? id[0] : (id ?? "")
  );

  const [refreshKey, setRefreshKey] = useState(0);

  const handleVoteSuccess = () => {
    setRefreshKey((k) => k + 1);
    refresh();
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[detailStyles.container, detailStyles.center]}>
        <Stack.Screen options={{ title: "Proposal" }} />
        <ActivityIndicator size="large" color={theme.colors.brand.primary} />
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !proposal) {
    return (
      <View style={[detailStyles.container, detailStyles.center]}>
        <Stack.Screen options={{ title: "Proposal" }} />
        <Text style={detailStyles.errorText}>{error ?? "Proposal not found."}</Text>
        <TouchableOpacity
          style={detailStyles.retryButton}
          onPress={() => (error ? refresh() : router.back())}
          accessibilityRole="button"
          accessibilityLabel={error ? "Retry" : "Go back"}
        >
          <Text style={detailStyles.retryButtonText}>{error ? "Retry" : "Go back"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Detail ─────────────────────────────────────────────────────────────────
  const sc = statusColor(proposal.status);

  return (
    <>
      <Stack.Screen
        options={{
          title: `Proposal #${proposal.id}`,
          gestureEnabled: true,
          headerBackVisible: true,
        }}
      />

      <ScrollView
        style={detailStyles.container}
        contentContainerStyle={detailStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero card (shared-element) ─────────────────────────────────── */}
        <Animated.View
          sharedTransitionTag={`governance-card-${proposal.id}`}
          sharedTransitionStyle={govCardTransition}
          style={[detailStyles.heroCard, { borderColor: sc.border }]}
        >
          <View style={detailStyles.heroHeader}>
            <Text style={detailStyles.heroTitle}>{proposal.title}</Text>
            <StatusBadge status={proposal.status} />
          </View>
          <Text style={detailStyles.heroDescription}>{proposal.description}</Text>
        </Animated.View>

        {/* ── Metadata ──────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).duration(350)} style={detailStyles.metaCard}>
          <Text style={detailStyles.sectionTitle}>Proposal Details</Text>
          <MetaRow label="Parameter" value={proposal.parameter} />
          <MetaRow label="New Value" value={proposal.new_value} />
          <MetaRow label="Proposer" value={shortAddress(proposal.proposer)} mono />
          <MetaRow label="Created at ledger" value={String(proposal.created_ledger)} mono />
        </Animated.View>

        {/* ── Quorum & vote breakdown ───────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(140).duration(350)}>
          <QuorumProgress
            key={refreshKey}
            votesFor={proposal.votes_for}
            votesAgainst={proposal.votes_against}
            quorum={proposal.effectiveQuorum}
          />
        </Animated.View>

        {/* ── Vote buttons (Active proposals only) ─────────────────────── */}
        {proposal.status === "Active" && connected && address ? (
          <VoteButtons
            proposalId={proposal.id}
            voterAddress={address}
            onVoteSuccess={handleVoteSuccess}
          />
        ) : proposal.status === "Active" && !connected ? (
          <Animated.View
            entering={FadeInUp.delay(200).duration(350)}
            style={detailStyles.connectPrompt}
          >
            <Text style={detailStyles.connectPromptText}>
              Connect your wallet to vote on this proposal.
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>
    </>
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

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },

  // Hero card
  heroCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: "#1E293B",
    padding: 18,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },
  heroTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#F1F5F9",
    lineHeight: 24,
  },
  heroDescription: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 21,
  },

  // Badges
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

  // Metadata card
  metaCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    padding: 16,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2d3748",
  },
  metaLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#e2e8f0",
    maxWidth: "60%",
    textAlign: "right",
  },
  mono: {
    fontFamily: "monospace",
  },

  // Quorum card
  quorumCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    padding: 16,
  },
  quorumTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#334155",
    overflow: "hidden",
    marginBottom: 6,
  },
  quorumFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#7C3AED",
  },
  quorumLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  quorumPct: {
    fontSize: 13,
    fontWeight: "700",
    color: "#a78bfa",
  },
  quorumTarget: {
    fontSize: 12,
    color: "#64748b",
  },
  splitTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
    overflow: "hidden",
    marginBottom: 8,
  },
  splitFor: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  splitLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  splitLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  splitFor_label: {
    fontSize: 12,
    color: "#34d399",
    fontWeight: "600",
  },
  splitAgainst_label: {
    fontSize: 12,
    color: "#f87171",
    fontWeight: "600",
  },

  // Vote row
  voteRow: {
    flexDirection: "row",
    gap: 10,
  },
  voteBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  voteBtnFor: {
    backgroundColor: "#065F46",
    borderWidth: 1,
    borderColor: "#10B981",
  },
  voteBtnAgainst: {
    backgroundColor: "#7F1D1D",
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  voteBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },

  // Connect prompt
  connectPrompt: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    padding: 16,
    alignItems: "center",
  },
  connectPromptText: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 19,
  },

  // Error / retry
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
});
