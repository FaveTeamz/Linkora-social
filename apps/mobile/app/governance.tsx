import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useVote, VoteChoice } from "../../hooks/useVote";
import { useTheme } from "../../theme/useTheme";

// ---------------------------------------------------------------------------
// Stub proposal data — replace with real API / contract query hook
// ---------------------------------------------------------------------------

interface Proposal {
  id: string;
  title: string;
  description: string;
  status: "active" | "closed";
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  endsAt: string;
}

const STUB_PROPOSALS: Proposal[] = [
  {
    id: "prop-001",
    title: "Increase creator reward allocation to 60%",
    description:
      "This proposal reallocates 10% of protocol revenue from the treasury reserve to creator rewards, increasing the creator share from 50% to 60%.",
    status: "active",
    forVotes: 8420,
    againstVotes: 1230,
    abstainVotes: 340,
    endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "prop-002",
    title: "Add USDC as a supported tip asset",
    description:
      "Enable USDC as an accepted tip asset in addition to XLM and creator tokens. Uses the existing tip contract with an asset whitelist extension.",
    status: "active",
    forVotes: 5110,
    againstVotes: 2780,
    abstainVotes: 990,
    endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// ProposalCard
// ---------------------------------------------------------------------------

interface ProposalCardProps {
  proposal: Proposal;
}

function ProposalCard({ proposal }: ProposalCardProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { submitting, submit } = useVote();

  const [voted, setVoted] = useState<VoteChoice | null>(null);

  const total = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes || 1;
  const forPct = Math.round((proposal.forVotes / total) * 100);
  const againstPct = Math.round((proposal.againstVotes / total) * 100);

  const handleVote = async (choice: VoteChoice) => {
    if (voted || submitting) return;
    await submit({ proposalId: proposal.id, choice });
    setVoted(choice);
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface.surface1,
          borderColor: theme.colors.surface.border,
        },
      ]}
    >
      {/* Status pill */}
      <View
        style={[
          styles.statusPill,
          {
            backgroundColor:
              proposal.status === "active"
                ? theme.colors.semantic.successLight
                : theme.colors.surface.surface2,
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            {
              color:
                proposal.status === "active"
                  ? theme.colors.semantic.success
                  : theme.colors.text.secondary,
            },
          ]}
        >
          {proposal.status === "active" ? "Active" : "Closed"}
        </Text>
      </View>

      {/* Title */}
      <Text style={[styles.title, { color: theme.colors.text.primary }]}>{proposal.title}</Text>

      {/* Description */}
      <Text style={[styles.description, { color: theme.colors.text.secondary }]}>
        {proposal.description}
      </Text>

      {/* Vote tally bar */}
      <View style={styles.tallyRow}>
        <View style={[styles.tallyBar, { backgroundColor: theme.colors.surface.surface2 }]}>
          <View
            style={[
              styles.tallyFill,
              {
                width: `${forPct}%`,
                backgroundColor: theme.colors.semantic.success,
              },
            ]}
          />
        </View>
        <Text style={[styles.tallyLabel, { color: theme.colors.text.secondary }]}>
          {forPct}% for · {againstPct}% against
        </Text>
      </View>

      {/* Vote buttons */}
      {voted ? (
        <View style={[styles.votedBadge, { backgroundColor: theme.colors.semantic.successLight }]}>
          <Text style={[styles.votedText, { color: theme.colors.semantic.success }]}>
            ✓ Voted {voted}
          </Text>
        </View>
      ) : proposal.status === "active" ? (
        <View style={styles.voteRow}>
          {(["for", "against", "abstain"] as VoteChoice[]).map((choice) => (
            <VoteButton
              key={choice}
              choice={choice}
              disabled={submitting}
              onPress={() => handleVote(choice)}
            />
          ))}
          {submitting ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.brand.primary}
              style={styles.spinner}
            />
          ) : null}
        </View>
      ) : (
        <Text style={[styles.closedNote, { color: theme.colors.text.disabled }]}>
          Voting closed
        </Text>
      )}

      {/* Ends at */}
      <Text style={[styles.endsAt, { color: theme.colors.text.secondary }]}>
        Ends {new Date(proposal.endsAt).toLocaleDateString()}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// VoteButton
// ---------------------------------------------------------------------------

interface VoteButtonProps {
  choice: VoteChoice;
  disabled: boolean;
  onPress: () => void;
}

const VOTE_BUTTON_COLORS: Record<VoteChoice, string> = {
  for: "#10B981",
  against: "#EF4444",
  abstain: "#6B7280",
};

function VoteButton({ choice, disabled, onPress }: VoteButtonProps) {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      style={[
        voteButtonStyles.button,
        {
          borderColor: VOTE_BUTTON_COLORS[choice],
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Vote ${choice}`}
      testID={`vote-button-${choice}`}
    >
      <Text
        style={[
          voteButtonStyles.label,
          {
            color: disabled ? theme.colors.text.disabled : VOTE_BUTTON_COLORS[choice],
          },
        ]}
      >
        {choice.charAt(0).toUpperCase() + choice.slice(1)}
      </Text>
    </TouchableOpacity>
  );
}

const voteButtonStyles = StyleSheet.create({
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
  },
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function GovernanceScreen() {
  const { theme } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.surface.background }}
      contentContainerStyle={screenStyles.content}
    >
      <Text style={[screenStyles.heading, { color: theme.colors.text.primary }]}>Governance</Text>
      <Text style={[screenStyles.subheading, { color: theme.colors.text.secondary }]}>
        Vote on active proposals to shape the protocol.
      </Text>

      {STUB_PROPOSALS.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} />
      ))}
    </ScrollView>
  );
}

const screenStyles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
});

// ---------------------------------------------------------------------------
// Card styles (depend on theme — built inside component via useMemo)
// ---------------------------------------------------------------------------

function createStyles(_theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      gap: 10,
    },
    statusPill: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 9999,
    },
    statusText: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    title: {
      fontSize: 16,
      fontWeight: "700",
      lineHeight: 22,
    },
    description: {
      fontSize: 13,
      lineHeight: 19,
    },
    tallyRow: {
      gap: 6,
    },
    tallyBar: {
      height: 6,
      borderRadius: 9999,
      overflow: "hidden",
    },
    tallyFill: {
      height: "100%",
      borderRadius: 9999,
    },
    tallyLabel: {
      fontSize: 11,
    },
    voteRow: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      marginTop: 4,
    },
    spinner: {
      marginLeft: 4,
    },
    votedBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 9999,
      marginTop: 4,
    },
    votedText: {
      fontSize: 13,
      fontWeight: "700",
    },
    closedNote: {
      fontSize: 12,
      fontStyle: "italic",
    },
    endsAt: {
      fontSize: 11,
    },
  });
}
