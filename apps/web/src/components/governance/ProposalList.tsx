/**
 * ProposalList — paginated, filterable list of governance proposals.
 *
 * Features:
 *  - Filter tabs: All / Active / Passed / Rejected (Failed + Vetoed)
 *  - Infinite-scroll pagination via IntersectionObserver
 *  - Loading skeleton between page fetches
 *  - Empty state per filter tab
 *  - Accessible: filter tabs use role="tablist" / role="tab" with aria-selected
 *
 * The component fetches proposals from the LinkoraClient passed via props so
 * callers can inject a real or mock client. Each proposal card includes a
 * QuorumBar to show the vote breakdown inline.
 *
 * Design tokens from globals.css are used for all colours.
 *
 * @example
 * ```tsx
 * <ProposalList
 *   client={linkoraClient}
 *   connected={connected}
 *   address={address}
 *   onVote={handleVote}
 *   onExecute={handleExecute}
 * />
 * ```
 */

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { GovProposal, GovStatus, LinkoraClient } from "linkora-sdk";
import { ProposalStatus } from "./ProposalStatus";
import { QuorumBar } from "./QuorumBar";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProposalWithQuorum = GovProposal & { effectiveQuorum: number };

export type FilterTab = "All" | "Active" | "Passed" | "Rejected";

export interface ProposalListProps {
  /** A LinkoraClient instance (real or mock). */
  client: LinkoraClient;
  /** Whether the current user's wallet is connected. */
  connected?: boolean;
  /** Stellar public key of the connected wallet, if any. */
  address?: string | null;
  /**
   * Called when the user submits a vote on a proposal.
   * The parent is responsible for the actual on-chain transaction.
   */
  onVote?: (proposalId: bigint, support: boolean) => Promise<void>;
  /**
   * Called when the user executes a passed proposal.
   */
  onExecute?: (proposalId: bigint) => Promise<void>;
  /** Additional class names applied to the outermost wrapper. */
  className?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const FILTER_TABS: FilterTab[] = ["All", "Active", "Passed", "Rejected"];

/** Maps each FilterTab to the GovStatus values it matches. */
const FILTER_MAP: Record<FilterTab, GovStatus[] | null> = {
  All: null, // null means no filtering
  Active: [GovStatus.Active],
  Passed: [GovStatus.Passed, GovStatus.Executed],
  Rejected: [GovStatus.Failed, GovStatus.Vetoed],
};

const EMPTY_MESSAGES: Record<FilterTab, string> = {
  All: "No proposals yet. Be the first to create one.",
  Active: "No active proposals at the moment.",
  Passed: "No proposals have passed yet.",
  Rejected: "No proposals have been rejected.",
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

/** Single proposal card loading skeleton. */
function ProposalSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse border border-[var(--border)] rounded-xl p-5 bg-[var(--background)]"
    >
      {/* Header row */}
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-2 flex-1 mr-4">
          <div className="h-5 bg-[var(--muted)] rounded w-3/4" />
          <div className="h-3 bg-[var(--muted)] rounded w-1/3" />
        </div>
        <div className="h-6 w-16 bg-[var(--muted)] rounded-full flex-shrink-0" />
      </div>
      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="h-14 bg-[var(--muted)] rounded-lg" />
        <div className="h-14 bg-[var(--muted)] rounded-lg" />
      </div>
      {/* Quorum bar */}
      <div className="h-4 bg-[var(--muted)] rounded-full" />
    </div>
  );
}

/** Renders N skeletons for between-page loading. */
function ProposalSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading proposals…">
      {Array.from({ length: count }, (_, i) => (
        <ProposalSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: FilterTab }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="py-16 text-center border border-[var(--border)] rounded-xl bg-[var(--muted)]/20"
    >
      {/* Decorative icon */}
      <div aria-hidden="true" className="text-4xl mb-3">
        🗳️
      </div>
      <p className="text-[var(--text-muted)] font-medium">{EMPTY_MESSAGES[tab]}</p>
    </div>
  );
}

// ── Infinite-scroll sentinel ──────────────────────────────────────────────────

interface SentinelProps {
  onIntersect: () => void;
  loading: boolean;
  hasMore: boolean;
}

function InfiniteScrollSentinel({ onIntersect, loading, hasMore }: SentinelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersect();
        }
      },
      { rootMargin: "150px" }
    );

    const el = ref.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [loading, hasMore, onIntersect]);

  if (!hasMore) {
    return (
      <p
        className="py-8 text-center text-sm text-[var(--text-muted)]"
        aria-live="polite"
      >
        All proposals loaded.
      </p>
    );
  }

  return (
    <div ref={ref} className="py-4" aria-live="polite">
      {loading && (
        <div className="flex items-center justify-center gap-2">
          <svg
            className="animate-spin h-5 w-5 text-[var(--text-muted)]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm text-[var(--text-muted)]">Loading more proposals…</span>
        </div>
      )}
    </div>
  );
}

// ── ProposalCard ──────────────────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: ProposalWithQuorum;
  connected: boolean;
  address?: string | null;
  votingProposalId: bigint | null;
  votingSupport: boolean | null;
  voteErrors: Record<string, string>;
  onVote?: (id: bigint, support: boolean) => Promise<void>;
  onExecute?: (id: bigint) => Promise<void>;
}

function ProposalCard({
  proposal: p,
  connected,
  address,
  votingProposalId,
  votingSupport,
  voteErrors,
  onVote,
  onExecute,
}: ProposalCardProps) {
  const key = p.id.toString();
  const isVoting = votingProposalId === p.id;

  return (
    <div
      key={key}
      tabIndex={0}
      role="article"
      aria-label={`Proposal #${key}: Update ${p.parameter}`}
      className="border border-[var(--border)] rounded-xl p-5 bg-[var(--background)] shadow-sm transition-all duration-200 hover:border-violet-500/60 hover:shadow-violet-950/20 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex justify-between items-start mb-4 gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[var(--foreground)] truncate">
            Proposal #{key}: Update {p.parameter}
          </h3>
          <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
            {p.proposer.slice(0, 6)}…{p.proposer.slice(-4)}
          </p>
        </div>
        <div className="flex-shrink-0">
          <ProposalStatus status={p.status} size="sm" />
        </div>
      </div>

      {/* ── Info grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div className="p-3 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
            New Value
          </p>
          <p className="text-base font-semibold text-[var(--foreground)]">
            {p.new_value.toString()}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Created Ledger
          </p>
          <p className="text-base font-semibold text-[var(--foreground)] font-mono">
            {p.created_ledger}
          </p>
        </div>
      </div>

      {/* ── Quorum bar ──────────────────────────────────────────────── */}
      <QuorumBar
        votesFor={p.votes_for}
        votesAgainst={p.votes_against}
        quorum={p.effectiveQuorum}
        className="mb-5"
      />

      {/* ── Vote / Execute actions ───────────────────────────────────── */}
      {connected && address && onVote && p.status === GovStatus.Active && (
        <div className="flex flex-col gap-2 items-end">
          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
            {/* Vote For */}
            <button
              onClick={() => onVote(p.id, true)}
              disabled={votingProposalId !== null}
              aria-busy={isVoting && votingSupport === true}
              className="flex-1 sm:flex-none px-4 py-2 bg-green-600/20 text-green-500 hover:bg-green-600/30 border border-green-600/50 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isVoting && votingSupport === true ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-green-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Submitting…
                </>
              ) : (
                "Vote For"
              )}
            </button>

            {/* Vote Against */}
            <button
              onClick={() => onVote(p.id, false)}
              disabled={votingProposalId !== null}
              aria-busy={isVoting && votingSupport === false}
              className="flex-1 sm:flex-none px-4 py-2 bg-red-600/20 text-red-500 hover:bg-red-600/30 border border-red-600/50 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isVoting && votingSupport === false ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-red-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Submitting…
                </>
              ) : (
                "Vote Against"
              )}
            </button>
          </div>

          {/* Pending status */}
          {isVoting && (
            <p
              className="text-xs text-violet-400 animate-pulse"
              role="status"
              aria-live="polite"
            >
              Submitting vote…
            </p>
          )}

          {/* Vote error */}
          {voteErrors[key] && (
            <p className="text-xs text-red-400 mt-1" role="alert" aria-live="assertive">
              {voteErrors[key]}
            </p>
          )}
        </div>
      )}

      {/* Execute button for passed proposals */}
      {connected && onExecute && p.status === GovStatus.Passed && (
        <div className="flex justify-end mt-2">
          <button
            onClick={() => onExecute(p.id)}
            className="px-4 py-2 bg-violet-600 text-white hover:bg-violet-500 rounded-lg transition-colors text-sm font-semibold shadow-md"
          >
            Execute
          </button>
        </div>
      )}
    </div>
  );
}

// ── ProposalList ──────────────────────────────────────────────────────────────

/**
 * Paginated, filterable governance proposal list with infinite scroll.
 *
 * @param props - {@link ProposalListProps}
 */
export function ProposalList({
  client,
  connected = false,
  address,
  onVote,
  onExecute,
  className,
}: ProposalListProps): React.JSX.Element {
  // ── State ──────────────────────────────────────────────────────────────
  const [proposals, setProposals] = useState<ProposalWithQuorum[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");

  // Vote interaction state
  const [votingProposalId, setVotingProposalId] = useState<bigint | null>(null);
  const [votingSupport, setVotingSupport] = useState<boolean | null>(null);
  const [voteErrors, setVoteErrors] = useState<Record<string, string>>({});

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchPage = useCallback(
    async (targetPage: number) => {
      const isFirstPage = targetPage === 1;
      if (isFirstPage) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setFetchError(null);

      try {
        const fetched: ProposalWithQuorum[] = [];
        const startId = (targetPage - 1) * PAGE_SIZE + 1;
        const endId = startId + PAGE_SIZE - 1;
        let foundAny = false;

        for (let n = startId; n <= endId; n++) {
          const id = BigInt(n);
          try {
            const prop = await client.govGetProposal(id);
            const quorum = await client.effectiveQuorum(id);
            fetched.push({ ...prop, effectiveQuorum: quorum });
            foundAny = true;
          } catch {
            // End of proposal list — stop scanning
            break;
          }
        }

        setProposals((prev) => {
          const combined = isFirstPage ? fetched : [...prev, ...fetched];
          // De-duplicate by proposal id
          const seen = new Set<string>();
          return combined.filter((p) => {
            const k = (p as { id?: { toString?: () => string } }).id?.toString?.() ?? "";
            if (!k || seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        });

        setHasMore(foundAny && fetched.length >= PAGE_SIZE);
        setPage(targetPage);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Failed to load proposals");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [client]
  );

  // Initial load
  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Infinite scroll callback ───────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchPage(page + 1);
    }
  }, [loadingMore, hasMore, fetchPage, page]);

  // ── Vote handler ───────────────────────────────────────────────────────
  const handleVote = useCallback(
    async (proposalId: bigint, support: boolean) => {
      if (!onVote || votingProposalId !== null) return;
      const key = proposalId.toString();
      setVotingProposalId(proposalId);
      setVotingSupport(support);
      setVoteErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        await onVote(proposalId, support);
        // Refresh from page 1 after a successful vote
        await fetchPage(1);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to submit vote.";
        setVoteErrors((prev) => ({ ...prev, [key]: msg }));
      } finally {
        setVotingProposalId(null);
        setVotingSupport(null);
      }
    },
    [onVote, votingProposalId, fetchPage]
  );

  // ── Execute handler ────────────────────────────────────────────────────
  const handleExecute = useCallback(
    async (proposalId: bigint) => {
      if (!onExecute) return;
      try {
        await onExecute(proposalId);
        await fetchPage(1);
      } catch (err) {
        console.error("Failed to execute proposal", err);
      }
    },
    [onExecute, fetchPage]
  );

  // ── Filtering ──────────────────────────────────────────────────────────
  const statusFilter = FILTER_MAP[activeTab];
  const displayed = statusFilter
    ? proposals.filter((p) => statusFilter.includes(p.status))
    : proposals;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={className}>
      {/* ── Filter tabs ─────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Filter proposals by status"
        className="flex space-x-2 border-b border-[var(--border)] pb-2 overflow-x-auto mb-6"
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === tab
                ? "bg-[var(--muted)] text-violet-400 border-b-2 border-violet-500"
                : "text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Error banner ────────────────────────────────────────────── */}
      {fetchError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400"
          data-testid="proposals-error"
        >
          Could not load proposals: {fetchError}
          <button
            onClick={() => fetchPage(1)}
            className="ml-3 underline text-red-300 hover:text-red-200 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── List body ───────────────────────────────────────────────── */}
      {loading ? (
        <ProposalSkeletonList count={3} />
      ) : displayed.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <>
          <div className="space-y-4">
            {displayed.map((p) => (
              <ProposalCard
                key={p.id.toString()}
                proposal={p}
                connected={connected}
                address={address}
                votingProposalId={votingProposalId}
                votingSupport={votingSupport}
                voteErrors={voteErrors}
                onVote={onVote ? handleVote : undefined}
                onExecute={onExecute ? handleExecute : undefined}
              />
            ))}
          </div>

          {/* Between-page loading skeleton */}
          {loadingMore && <ProposalSkeletonList count={2} />}

          {/* Infinite scroll sentinel */}
          <InfiniteScrollSentinel
            onIntersect={loadMore}
            loading={loadingMore}
            hasMore={hasMore}
          />
        </>
      )}
    </div>
  );
}

export default ProposalList;
