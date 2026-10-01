import { useCallback, useState } from "react";
import * as Haptics from "expo-haptics";

import { useToast } from "../context/ToastContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoteChoice = "for" | "against" | "abstain";

export interface VoteParams {
  proposalId: string;
  choice: VoteChoice;
}

export interface UseVoteReturn {
  submitting: boolean;
  submit: (params: VoteParams) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useVote — submits a governance vote with haptic feedback.
 *
 * Haptic behaviour (AC #175):
 * - Light impact on vote button tap — gives tactile confirmation the press
 *   registered before the async transaction starts.
 * - Success notification haptic on confirmed transaction.
 * - Error notification haptic on failed transaction.
 * - Uses the device's accessibility settings: Haptics APIs are no-ops on
 *   devices where haptics are disabled in system accessibility preferences.
 */
export function useVote(): UseVoteReturn {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async ({ proposalId, choice }: VoteParams) => {
      // Light haptic on button tap — immediate tactile feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      setSubmitting(true);
      try {
        // TODO: replace with real SDK call when governance contract is wired up.
        // Simulates a network round-trip.
        await simulateVoteTx(proposalId, choice);

        // Success haptic on transaction confirmation
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        showToast({
          kind: "success",
          title: "Vote submitted",
          message: `Your ${choice} vote on proposal ${proposalId} was recorded.`,
        });
      } catch (err) {
        // Error haptic on transaction failure
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        showToast({
          kind: "error",
          title: "Vote failed",
          message: err instanceof Error ? err.message : "Transaction rejected.",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [showToast]
  );

  return { submitting, submit };
}

// ---------------------------------------------------------------------------
// Stub — replace with real SDK call
// ---------------------------------------------------------------------------

async function simulateVoteTx(proposalId: string, choice: VoteChoice): Promise<void> {
  // Simulate network delay
  await new Promise<void>((resolve) => setTimeout(resolve, 1200));
  // Uncomment to test error path:
  // throw new Error("Simulated transaction failure");
  void proposalId;
  void choice;
}
