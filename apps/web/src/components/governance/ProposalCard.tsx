"use client";

/**
 * ProposalCard — displays a single governance proposal.
 *
 * Dark mode is handled entirely through CSS custom properties defined in
 * globals.css and docs/design/tokens.css. No hardcoded colour values are
 * used; all colours reference the semantic design-token variables so that the
 * dark/light toggle switches this component correctly.
 */

import React from "react";
import type { GovProposal, GovStatus } from "linkora-sdk";

type ProposalWithQuorum = GovProposal & { effectiveQuorum: number };

interface ProposalCardProps {
  proposal: ProposalWithQuorum;
  connected: boolean;
  onVote: (proposalId: bigint, support: boolean) => void;
  onExecute: (proposalId: bigint) => void;
  activeStatus: typeof import("linkora-sdk").GovStatus;
  passedStatus: typeof import("linkora-sdk").GovStatus;
}

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  Active: {
    bg: "color-mix(in srgb, var(--color-primary) 15%, transparent)",
    text: "var(--color-primary)",
    border: "color-mix(in srgb, var(--color-primary) 40%, transparent)",
  },
  Passed: {
    bg: "color-mix(in srgb, var(--color-success) 15%, transparent)",
    text: "var(--color-success)",
    border: "color-mix(in srgb, var(--color-success) 40%, transparent)",
  },
  Executed: {
    bg: "color-mix(in srgb, var(--color-secondary) 15%, transparent)",
    text: "var(--color-secondary)",
    border: "color-mix(in srgb, var(--color-secondary) 40%, transparent)",
  },
  default: {
    bg: "var(--muted)",
    text: "var(--text-muted)",
    border: "var(--border)",
  },
};

export function ProposalCard({
  proposal: p,
  connected,
  onVote,
  onExecute,
  activeStatus,
  passedStatus,
}: ProposalCardProps) {
  const statusStr = String(p.status);
  const statusStyle = statusColors[statusStr] ?? statusColors.default;

  return (
    <article
      className="proposal-card border border-border bg-background text-foreground"
      style={{
        borderRadius: "0.75rem",
        padding: "1.25rem",
      }}
      aria-label={`Proposal ${p.id.toString()}: Update ${p.parameter}`}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1rem",
          gap: "1rem",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: "1.05rem",
              fontWeight: 700,
              color: "var(--foreground)",
            }}
          >
            Proposal #{p.id.toString()}: Update {p.parameter}
          </h3>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              fontFamily: "monospace",
            }}
          >
            Proposer: {p.proposer.slice(0, 6)}…{p.proposer.slice(-4)}
          </p>
        </div>

        {/* Status badge — uses semantic colour only, no hardcoded greys */}
        <span
          style={{
            padding: "0.25rem 0.75rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            borderRadius: "9999px",
            backgroundColor: statusStyle.bg,
            color: statusStyle.text,
            border: `1px solid ${statusStyle.border}`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {statusStr}
        </span>
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.25rem",
        }}
      >
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.5rem",
            backgroundColor: "var(--muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted)",
            }}
          >
            New Value
          </p>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "1.05rem",
              fontWeight: 600,
              color: "var(--foreground)",
            }}
          >
            {p.new_value.toString()}
          </p>
        </div>

        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.5rem",
            backgroundColor: "var(--muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted)",
            }}
          >
            Effective Quorum
          </p>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "1.05rem",
              fontWeight: 600,
              color: "var(--foreground)",
            }}
          >
            {p.effectiveQuorum}
          </p>
        </div>
      </div>

      {/* Vote counts + actions */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", gap: "1rem", fontSize: "0.9rem", fontWeight: 500 }}>
          <span style={{ color: "var(--color-success)" }}>For: {p.votes_for}</span>
          <span style={{ color: "var(--color-error)" }}>Against: {p.votes_against}</span>
        </div>

        {connected && p.status === activeStatus && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              onClick={() => onVote(p.id, true)}
              className="proposal-vote-btn proposal-vote-btn--for"
              style={{
                padding: "0.4rem 1rem",
                borderRadius: "0.5rem",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
                border: "1px solid color-mix(in srgb, var(--color-success) 50%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--color-success) 12%, transparent)",
                color: "var(--color-success)",
                transition: "background-color 0.15s ease",
              }}
            >
              Vote For
            </button>
            <button
              onClick={() => onVote(p.id, false)}
              className="proposal-vote-btn proposal-vote-btn--against"
              style={{
                padding: "0.4rem 1rem",
                borderRadius: "0.5rem",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
                border: "1px solid color-mix(in srgb, var(--color-error) 50%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--color-error) 12%, transparent)",
                color: "var(--color-error)",
                transition: "background-color 0.15s ease",
              }}
            >
              Vote Against
            </button>
          </div>
        )}

        {connected && p.status === passedStatus && (
          <button
            onClick={() => onExecute(p.id)}
            style={{
              padding: "0.4rem 1rem",
              borderRadius: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              backgroundColor: "var(--color-primary)",
              color: "var(--color-text-on-brand)",
              transition: "background-color 0.15s ease",
            }}
          >
            Execute
          </button>
        )}
      </div>
    </article>
  );
}
