"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { loadConversationMeta, type ConversationMeta } from "@/lib/dm/storage";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  address: string;
  username: string;
  /** Truncated (≤50 chars) plaintext preview of the last message. */
  lastMessagePreview: string | null;
  /** Unix timestamp (ms) of the last message, used for recency sorting. */
  lastMessageTime: number | null;
  /** Number of unread messages in this conversation. */
  unreadCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Deterministic blockie avatar generated from the wallet address.
 * Two-tone SVG; no external dependencies.
 */
function getBlockieSvg(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c1 = (hash & 0x00ffffff).toString(16).padStart(6, "0");
  const c2 = ((hash >> 8) & 0x00ffffff).toString(16).padStart(6, "0");
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="40" height="40"><rect width="8" height="8" fill="%23${c1}"/><rect x="1" y="1" width="6" height="6" fill="%23${c2}" opacity="0.6"/></svg>`;
}

/** Shorten a long address for display. */
function formatAddress(addr: string): string {
  return addr.length < 12 ? addr : `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Truncate text to `maxLen` characters, appending "…" when truncated.
 */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/**
 * Human-readable relative timestamp (e.g. "2h ago", "Mon").
 */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { address, connected, connect } = useWallet();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !address) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/follows/${address}/following?limit=50`);
        if (!res.ok) throw new Error("Failed to load conversations");
        const data = await res.json();

        const following: Array<{ address: string; username: string }> = data.following ?? [];

        // Enrich each entry with locally-cached conversation metadata
        const enriched: Conversation[] = following.map((user) => {
          const meta: ConversationMeta | null = loadConversationMeta(address, user.address);
          return {
            address: user.address,
            username: user.username,
            lastMessagePreview: meta?.lastMessagePreview ?? null,
            lastMessageTime: meta?.lastMessageTime ?? null,
            unreadCount: meta?.unreadCount ?? 0,
          };
        });

        // Sort: conversations with messages first (most recent first),
        // then conversations with no messages (alphabetical by username).
        enriched.sort((a, b) => {
          if (a.lastMessageTime !== null && b.lastMessageTime !== null) {
            return b.lastMessageTime - a.lastMessageTime;
          }
          if (a.lastMessageTime !== null) return -1;
          if (b.lastMessageTime !== null) return 1;
          return a.username.localeCompare(b.username);
        });

        if (!cancelled) setConversations(enriched);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load conversations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, connected]);

  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:py-8 pb-24 md:pb-8">
      <h1 className="mb-6 text-2xl font-bold text-[var(--color-text-primary)]">Messages</h1>

      {/* ── Not connected ─────────────────────────────────────────────── */}
      {!connected || !address ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--muted)] p-6 text-center shadow-lg">
          <p className="mb-4 text-[var(--text-muted)]">
            Connect your wallet to see your conversations.
          </p>
          <button
            onClick={connect}
            className="rounded-xl bg-[var(--color-primary)] px-6 py-2.5 font-semibold text-white transition-all hover:bg-[var(--color-primary-hover)]"
          >
            Connect Wallet
          </button>
        </div>
      ) : /* ── Loading ──────────────────────────────────────────────────── */
      loading ? (
        <div className="flex items-center justify-center gap-2 p-6" aria-live="polite">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-info)]" />
          <p className="text-sm text-[var(--text-muted)]">Loading conversations…</p>
        </div>
      ) : /* ── Error ────────────────────────────────────────────────────── */
      error ? (
        <div
          className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </div>
      ) : /* ── Empty state ──────────────────────────────────────────────── */
      conversations.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--muted)]/50 p-12 text-center">
          <p className="mb-1 text-lg font-bold text-[var(--color-text-primary)]">
            No conversations yet
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Follow people to start a direct message with them.
          </p>
        </div>
      ) : (
        /* ── Conversation list ────────────────────────────────────────── */
        <ul className="flex flex-col gap-1" role="list">
          {conversations.map((conv) => {
            const isUnread = conv.unreadCount > 0;
            return (
              <li key={conv.address}>
                <Link
                  href={`/dm/${conv.address}`}
                  className={[
                    "group flex items-center gap-3 rounded-xl border p-3",
                    "transition-all duration-150 outline-none",
                    // Base border + background
                    "border-[var(--color-border)] bg-[var(--muted)]",
                    // Hover: slightly elevated surface + primary-tinted border
                    "hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)]",
                    // Focus-visible ring using design token
                    "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1",
                  ].join(" ")}
                  aria-label={`Open conversation with @${conv.username}${isUnread ? `, ${conv.unreadCount} unread` : ""}`}
                >
                  {/* ── Avatar + unread dot ──────────────────────────── */}
                  <div className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getBlockieSvg(conv.address)}
                      alt=""
                      aria-hidden="true"
                      className="h-11 w-11 rounded-full border border-[var(--color-border)] object-cover"
                    />
                    {isUnread && (
                      <span
                        className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--muted)] bg-[var(--color-primary)]"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  {/* ── Name + preview ────────────────────────────────── */}
                  <div className="min-w-0 flex-1">
                    {/* Row 1: username + timestamp */}
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={[
                          "truncate text-sm",
                          isUnread
                            ? "font-bold text-[var(--color-text-primary)]"
                            : "font-semibold text-[var(--color-text-primary)]",
                        ].join(" ")}
                      >
                        @{conv.username}
                      </p>
                      {conv.lastMessageTime !== null && (
                        <span className="shrink-0 text-xs text-[var(--text-muted)]">
                          {relativeTime(conv.lastMessageTime)}
                        </span>
                      )}
                    </div>

                    {/* Row 2: last message preview OR address */}
                    {conv.lastMessagePreview !== null ? (
                      <p
                        className={[
                          "truncate text-xs",
                          isUnread
                            ? "font-semibold text-[var(--color-text-primary)]"
                            : "text-[var(--text-muted)]",
                        ].join(" ")}
                      >
                        {truncate(conv.lastMessagePreview, 50)}
                      </p>
                    ) : (
                      <p className="truncate font-mono text-xs text-[var(--text-muted)]">
                        {formatAddress(conv.address)}
                      </p>
                    )}
                  </div>

                  {/* ── Unread badge ──────────────────────────────────── */}
                  {isUnread && (
                    <span
                      className="ml-1 shrink-0 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                      aria-label={`${conv.unreadCount} unread`}
                    >
                      {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
