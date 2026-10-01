"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import {
  fetchPosts,
  fetchAttestation,
  computeAnalytics,
  formatStroops,
  dateRangeToLedgerRange,
  type AnalyticsData,
  type TipEarningPoint,
} from "@/lib/analytics";
import { EarningsEmptyState } from "@/components/dashboard/EarningsEmptyState";

/* ── State machine ──────────────────────────────────────────────────────── */

type PageState =
  | { status: "loading" }
  | { status: "disconnected" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: AnalyticsData };

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function CreatorEarningsPage() {
  const { address, connected } = useWallet();
  const [state, setState] = useState<PageState>({ status: "loading" });

  const loadEarnings = useCallback(async () => {
    if (!connected || !address) {
      setState({ status: "disconnected" });
      return;
    }

    setState({ status: "loading" });

    try {
      const [posts, attestation] = await Promise.all([
        fetchPosts(address),
        fetchAttestation(address),
      ]);

      const ledgerRange = dateRangeToLedgerRange(30);
      const data = computeAnalytics(posts, attestation, ledgerRange);

      // "No earnings" when total on-chain tips are zero and no attestation tip data.
      const hasEarnings =
        BigInt(data.summary.totalTips) > 0n ||
        data.tipEarnings.some((p) => p.earnings > 0);

      if (!hasEarnings) {
        setState({ status: "empty" });
        return;
      }

      setState({ status: "loaded", data });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to load earnings",
      });
    }
  }, [address, connected]);

  useEffect(() => {
    loadEarnings();
  }, [loadEarnings]);

  return (
    <div
      className="min-h-screen bg-[var(--bg-primary)]"
      data-testid="creator-earnings-page"
    >
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Page header */}
        <header>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Earnings</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Tips you&apos;ve received from your supporters
          </p>
        </header>

        {/* State-driven content */}
        {state.status === "loading" && <LoadingSkeleton />}

        {state.status === "disconnected" && (
          <div
            className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--bg-tertiary)] p-12 text-center"
            data-testid="earnings-disconnected"
          >
            <p className="text-[var(--text-muted)] mb-4">
              Connect your wallet to view your earnings.
            </p>
            <Link
              href="/feed"
              className="inline-block px-6 py-2 rounded-full bg-[var(--color-primary)] text-white font-semibold hover:opacity-90 transition-opacity"
            >
              Go to Feed
            </Link>
          </div>
        )}

        {state.status === "error" && (
          <div
            className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--bg-tertiary)] p-12 text-center"
            data-testid="earnings-error"
          >
            <p className="text-[var(--error)] mb-4">{state.message}</p>
            <button
              onClick={loadEarnings}
              className="px-6 py-2 rounded-full bg-[var(--color-primary)] text-white font-semibold hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Empty state — the feature this issue adds ────────────────── */}
        {state.status === "empty" && (
          <div
            className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--bg-tertiary)]"
            data-testid="earnings-empty-container"
          >
            <EarningsEmptyState />
          </div>
        )}

        {/* ── Loaded state — earnings detail ───────────────────────────── */}
        {state.status === "loaded" && (
          <EarningsDashboard data={state.data} />
        )}
      </div>
    </div>
  );
}

/* ── Loading skeleton ───────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading earnings"
      data-testid="earnings-loading"
    >
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-24 bg-[var(--bg-secondary)] rounded-2xl border border-[var(--bg-tertiary)] animate-pulse"
        />
      ))}
    </div>
  );
}

/* ── Earnings dashboard (when tips exist) ───────────────────────────────── */

function EarningsDashboard({ data }: { data: AnalyticsData }) {
  const { summary, tipEarnings } = data;

  const totalXlm = summary.totalTipsXlm;
  const tippedPosts = tipEarnings.filter((p) => p.earnings > 0).length;

  return (
    <div className="space-y-6" data-testid="earnings-dashboard">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Total Earned"
          value={`${totalXlm} XLM`}
          testId="earnings-total"
        />
        <SummaryCard
          label="Unique Tippers"
          value={String(summary.uniqueTippers)}
          testId="earnings-tippers"
        />
        <SummaryCard
          label="Tipped Posts"
          value={String(tippedPosts)}
          testId="earnings-tipped-posts"
        />
      </div>

      {/* Tip earnings timeline */}
      <section
        className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--bg-tertiary)] p-6"
        aria-label="Tip earnings over time"
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
          Earnings Timeline
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Tips received per day (last 30 days)
        </p>

        {tipEarnings.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm py-6 text-center">
            No data for this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--bg-tertiary)]">
                  <th className="text-left py-2 px-3 text-[var(--text-muted)] font-medium">
                    Date
                  </th>
                  <th className="text-right py-2 px-3 text-[var(--text-muted)] font-medium">
                    Tips (stroops)
                  </th>
                  <th className="text-right py-2 px-3 text-[var(--text-muted)] font-medium">
                    XLM
                  </th>
                </tr>
              </thead>
              <tbody>
                {tipEarnings.map((point: TipEarningPoint) => (
                  <tr
                    key={point.date}
                    className="border-b border-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] transition-colors"
                  >
                    <td className="py-2 px-3 text-[var(--text-primary)]">{point.date}</td>
                    <td className="py-2 px-3 text-right text-[var(--text-primary)]">
                      {point.earnings.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-[var(--accent-teal)]">
                      {formatStroops(String(point.earnings))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div
      className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--bg-tertiary)] p-4"
      data-testid={testId}
    >
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="text-xl font-bold text-[var(--text-primary)] truncate">{value}</p>
    </div>
  );
}
