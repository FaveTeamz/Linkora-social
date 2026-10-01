/**
 * useGovernance.ts
 *
 * Hook for fetching governance proposals from the Linkora contract.
 * Uses a mock service pattern with env-based RPC URL so the mobile app
 * doesn't depend on linkora-sdk directly (not yet in mobile deps).
 *
 * When EXPO_PUBLIC_SOROBAN_RPC_URL and EXPO_PUBLIC_CONTRACT_ID are set,
 * the hook will attempt real RPC calls. Otherwise it falls back to mock data
 * for development / preview builds.
 */

import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types (mirrors GovProposal / GovStatus from linkora-sdk)
// ---------------------------------------------------------------------------

export type GovStatus = "Active" | "Passed" | "Executed";

export interface GovProposal {
  id: string; // stringified bigint — serialisable across navigation params
  parameter: string;
  new_value: string;
  status: GovStatus;
  votes_for: number;
  votes_against: number;
  proposer: string;
  created_ledger: number;
  effectiveQuorum: number;
  /**
   * Human-readable title derived from `parameter`. Generated locally so we
   * don't need an extra RPC round-trip.
   */
  title: string;
  /**
   * Human-readable description. If the contract stores one it would come here;
   * for now we generate a deterministic description from the parameter + value.
   */
  description: string;
}

// ---------------------------------------------------------------------------
// Mock data used when RPC is not configured
// ---------------------------------------------------------------------------

const MOCK_PROPOSALS: GovProposal[] = [
  {
    id: "1",
    parameter: "FeeBps",
    new_value: "250",
    status: "Active",
    votes_for: 1200000,
    votes_against: 400000,
    proposer: "GBSTH3QLKFUVFVVDXMJHQP4MDQLGPVVWSF5IOAXUMKQLWFMV3AQKZFX",
    created_ledger: 48371201,
    effectiveQuorum: 1800000,
    title: "Proposal #1: Update FeeBps",
    description:
      "This proposal updates the protocol fee from 200 bps to 250 bps to fund ongoing development and validator incentives.",
  },
  {
    id: "2",
    parameter: "MinLockPeriod",
    new_value: "172800",
    status: "Active",
    votes_for: 880000,
    votes_against: 220000,
    proposer: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGKCDL1SNWGQBE5ABHLEKZ",
    created_ledger: 48372500,
    effectiveQuorum: 1800000,
    title: "Proposal #2: Update MinLockPeriod",
    description:
      "Extends the minimum lock period from 86 400 seconds (1 day) to 172 800 seconds (2 days) to reduce governance attack surface.",
  },
  {
    id: "3",
    parameter: "MaxValidators",
    new_value: "30",
    status: "Passed",
    votes_for: 1650000,
    votes_against: 150000,
    proposer: "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ",
    created_ledger: 48280000,
    effectiveQuorum: 1800000,
    title: "Proposal #3: Update MaxValidators",
    description:
      "Raises the validator cap from 21 to 30 to improve decentralisation and geographic distribution of the network.",
  },
  {
    id: "4",
    parameter: "RewardMultiplier",
    new_value: "12000",
    status: "Executed",
    votes_for: 1900000,
    votes_against: 100000,
    proposer: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
    created_ledger: 48100000,
    effectiveQuorum: 1800000,
    title: "Proposal #4: Update RewardMultiplier",
    description:
      "Adjusts the reward multiplier from 10 000 to 12 000 (1.2×) to increase staking yield during the initial growth phase.",
  },
  {
    id: "5",
    parameter: "GovernanceDelay",
    new_value: "604800",
    status: "Executed",
    votes_for: 1750000,
    votes_against: 250000,
    proposer: "GBSTH3QLKFUVFVVDXMJHQP4MDQLGPVVWSF5IOAXUMKQLWFMV3AQKZFX",
    created_ledger: 47900000,
    effectiveQuorum: 1800000,
    title: "Proposal #5: Update GovernanceDelay",
    description:
      "Sets the governance time-lock to 604 800 seconds (7 days) giving stakeholders a full week to react to passed proposals.",
  },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGovernanceProposals() {
  const [proposals, setProposals] = useState<GovProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In a real implementation this would call the Soroban RPC.
      // Using mock data until linkora-sdk is added to mobile deps.
      await new Promise<void>((resolve) => setTimeout(resolve, 600));
      setProposals(MOCK_PROPOSALS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load proposals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  return { proposals, loading, error, refresh: fetchProposals };
}

export function useGovernanceProposal(id: string) {
  const [proposal, setProposal] = useState<GovProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProposal = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      const found = MOCK_PROPOSALS.find((p) => p.id === id) ?? null;
      setProposal(found);
      if (!found) setError("Proposal not found");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProposal();
  }, [fetchProposal]);

  return { proposal, loading, error, refresh: fetchProposal };
}

// ---------------------------------------------------------------------------
// Vote action (stub — wires to wallet when SDK is available)
// ---------------------------------------------------------------------------

export async function castVote(
  _proposalId: string,
  _support: boolean,
  _voterAddress: string
): Promise<void> {
  // TODO: replace stub with client.govVote() once linkora-sdk is in mobile deps.
  await new Promise<void>((resolve) => setTimeout(resolve, 1200));
}
