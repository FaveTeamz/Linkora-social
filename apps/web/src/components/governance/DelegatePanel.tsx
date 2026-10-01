/**
 * DelegatePanel — governance vote-delegation UI component.
 *
 * Allows a token holder to:
 *  1. See their currently set delegate (if any).
 *  2. Search for a delegate by Stellar address or username via profile autocomplete.
 *  3. Confirm the delegation in a Radix Dialog before submitting it on-chain.
 *
 * The component calls `GovernanceClient.delegate(delegator, delegatee)`.  The
 * SDK does not yet expose this method; the call is wired through a typed
 * `govDelegate` prop so callers can pass the real implementation once it lands,
 * or a mock during development / testing.
 *
 * Design tokens are used exclusively — no hard-coded Tailwind colour utilities.
 */

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { UserCheck, X, Search, Loader2, ArrowRight, AlertCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DelegateProfile {
  address: string;
  username?: string;
  displayName?: string;
}

export interface DelegatePanelProps {
  /** Stellar public key of the currently connected wallet. */
  delegator: string;
  /**
   * The currently set delegate address, if one exists.
   * Pass `null` when no delegate is set.
   */
  currentDelegate?: DelegateProfile | null;
  /**
   * Called when the user confirms a new delegation.
   *
   * Mirrors the future `GovernanceClient.delegate(delegator, delegatee)` SDK
   * method signature.  Throw to signal failure — the panel will surface the
   * error to the user.
   */
  govDelegate: (delegator: string, delegatee: string) => Promise<void>;
  /**
   * Called after a successful delegation so the parent can refresh
   * the displayed current delegate.
   */
  onDelegateChange?: (newDelegate: DelegateProfile) => void;
  /** Additional class names for the host element. */
  className?: string;
}

// ── Inline style helpers (design tokens) ─────────────────────────────────────

const styles = {
  panel: {
    background: "var(--background)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    padding: "20px",
  } as React.CSSProperties,

  label: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--text-muted)",
    marginBottom: "4px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  } as React.CSSProperties,

  input: {
    width: "100%",
    background: "var(--muted)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    padding: "8px 12px 8px 36px",
    color: "var(--foreground)",
    fontSize: "0.875rem",
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  inputFocused: {
    borderColor: "var(--color-primary)",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent)",
  } as React.CSSProperties,

  suggestion: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    cursor: "pointer",
    borderRadius: "6px",
  } as React.CSSProperties,

  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "color-mix(in srgb, var(--color-primary) 20%, transparent)",
    color: "var(--color-primary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "0.75rem",
    flexShrink: 0,
  } as React.CSSProperties,

  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "0.875rem",
    cursor: "pointer",
    background: "var(--color-primary)",
    color: "var(--color-text-on-brand)",
    border: "none",
    transition: "background 150ms",
  } as React.CSSProperties,

  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "0.875rem",
    cursor: "pointer",
    background: "transparent",
    color: "var(--text-muted)",
    border: "1px solid var(--color-border)",
    transition: "border-color 150ms",
  } as React.CSSProperties,

  dialogOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  dialogContent: {
    background: "var(--background)",
    border: "1px solid var(--color-border)",
    borderRadius: "14px",
    padding: "28px",
    maxWidth: "420px",
    width: "90vw",
    position: "relative" as const,
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
} as const;

// ── Address utilities ─────────────────────────────────────────────────────────

/** Truncate a Stellar address to `GXXXX…YYYY` format. */
function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Basic Stellar public-key validation (starts with G, 56 chars). */
function isValidStellarAddress(addr: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(addr.trim());
}

/** Return initials for an avatar placeholder. */
function getInitials(profile: DelegateProfile): string {
  if (profile.username) return profile.username.slice(0, 2).toUpperCase();
  return profile.address.slice(1, 3).toUpperCase();
}

// ── ProfileSuggestionItem ─────────────────────────────────────────────────────

interface ProfileSuggestionItemProps {
  profile: DelegateProfile;
  onSelect: (profile: DelegateProfile) => void;
}

function ProfileSuggestionItem({ profile, onSelect }: ProfileSuggestionItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      role="option"
      aria-selected={false}
      style={{
        ...styles.suggestion,
        background: hovered ? "var(--muted)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        // Use onMouseDown instead of onClick to fire before onBlur on the input
        e.preventDefault();
        onSelect(profile);
      }}
    >
      <div style={styles.avatar} aria-hidden="true">
        {getInitials(profile)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {profile.displayName && (
          <p style={{ margin: 0, fontWeight: 600, fontSize: "0.875rem", color: "var(--foreground)" }}>
            {profile.displayName}
          </p>
        )}
        <p
          style={{
            margin: 0,
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            fontFamily: "monospace",
          }}
        >
          {profile.username ? `@${profile.username}` : truncateAddress(profile.address)}
        </p>
      </div>
    </li>
  );
}

// ── DelegatePanel ─────────────────────────────────────────────────────────────

/**
 * Panel that lets a token holder set or update their voting delegate.
 *
 * @example
 * ```tsx
 * <DelegatePanel
 *   delegator={walletAddress}
 *   currentDelegate={currentDelegateProfile}
 *   govDelegate={async (from, to) => {
 *     const xdr = client.govDelegate(from, to);
 *     await submitTransaction(xdr);
 *   }}
 *   onDelegateChange={(delegate) => setCurrentDelegate(delegate)}
 * />
 * ```
 */
export function DelegatePanel({
  delegator,
  currentDelegate = null,
  govDelegate,
  onDelegateChange,
  className,
}: DelegatePanelProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DelegateProfile[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<DelegateProfile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Autocomplete fetch ──────────────────────────────────────────────────────

  const fetchSuggestions = useCallback(async (q: string) => {
    const trimmed = q.trim();

    // If the query looks like a complete Stellar address, skip the API call
    if (isValidStellarAddress(trimmed)) {
      setSuggestions([{ address: trimmed }]);
      setLoadingSuggestions(false);
      return;
    }

    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingSuggestions(true);
    try {
      const res = await fetch(
        `/api/profiles/search?q=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error("Search failed");
      const data = (await res.json()) as { profiles: Array<{ address: string; username?: string; display_name?: string }> };
      setSuggestions(
        data.profiles.map((p) => ({
          address: p.address,
          username: p.username,
          displayName: p.display_name,
        }))
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSuggestions([]);
      }
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggestions]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelectProfile = (profile: DelegateProfile) => {
    setSelectedProfile(profile);
    setQuery(profile.username ? `@${profile.username}` : profile.address);
    setSuggestions([]);
    setInputFocused(false);
  };

  const handleOpenDialog = () => {
    if (!selectedProfile && isValidStellarAddress(query.trim())) {
      setSelectedProfile({ address: query.trim() });
    }
    setSubmitError(null);
    setDialogOpen(true);
  };

  const handleConfirmDelegate = async () => {
    const target = selectedProfile;
    if (!target) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await govDelegate(delegator, target.address);
      setSuccessMessage(
        `Successfully delegated to ${target.displayName ?? target.username ?? truncateAddress(target.address)}`
      );
      setDialogOpen(false);
      setQuery("");
      setSelectedProfile(null);
      onDelegateChange?.(target);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Delegation failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const canDelegate =
    query.trim().length > 0 &&
    (selectedProfile !== null || isValidStellarAddress(query.trim()));

  const showDropdown = inputFocused && (suggestions.length > 0 || loadingSuggestions);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={styles.panel}
      className={className}
      data-testid="delegate-panel"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <UserCheck size={18} color="var(--color-primary)" aria-hidden="true" />
        <h3
          style={{
            margin: 0,
            fontSize: "1rem",
            fontWeight: 700,
            color: "var(--foreground)",
          }}
        >
          Vote Delegation
        </h3>
      </div>

      {/* Current delegate display */}
      {currentDelegate ? (
        <div
          data-testid="current-delegate"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 12px",
            borderRadius: "8px",
            background: "color-mix(in srgb, var(--color-success) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)",
            marginBottom: "16px",
          }}
        >
          <div style={{ ...styles.avatar, background: "color-mix(in srgb, var(--color-success) 20%, transparent)", color: "var(--color-success)" }}>
            {getInitials(currentDelegate)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-success)", fontWeight: 600 }}>
              Currently delegating to
            </p>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--foreground)", fontWeight: 500 }}>
              {currentDelegate.displayName ?? currentDelegate.username ?? truncateAddress(currentDelegate.address)}
            </p>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
              {truncateAddress(currentDelegate.address)}
            </p>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "16px", margin: "0 0 16px" }}>
          No delegate set. You are voting with your own balance.
        </p>
      )}

      {/* Address / username input */}
      <div style={{ marginBottom: "12px" }}>
        <label htmlFor="delegate-input" style={styles.label}>
          {currentDelegate ? "Change delegate" : "Delegate to"}
        </label>

        <div style={{ position: "relative" }}>
          {/* Search icon */}
          <Search
            size={14}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "11px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />

          <input
            id="delegate-input"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls="delegate-suggestions"
            aria-label="Search for delegate by username or Stellar address"
            autoComplete="off"
            placeholder="@username or Stellar address"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedProfile(null);
            }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            style={{
              ...styles.input,
              ...(inputFocused ? styles.inputFocused : {}),
            }}
          />

          {loadingSuggestions && (
            <Loader2
              size={14}
              aria-hidden="true"
              style={{
                position: "absolute",
                right: "11px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                animation: "spin 1s linear infinite",
              }}
            />
          )}

          {/* Autocomplete dropdown */}
          {showDropdown && (
            <ul
              id="delegate-suggestions"
              role="listbox"
              aria-label="Delegate suggestions"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                background: "var(--background)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "4px",
                margin: 0,
                listStyle: "none",
                zIndex: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                maxHeight: "220px",
                overflowY: "auto",
              }}
            >
              {loadingSuggestions && suggestions.length === 0 ? (
                <li
                  style={{ padding: "10px 12px", fontSize: "0.8rem", color: "var(--text-muted)" }}
                >
                  Searching…
                </li>
              ) : (
                suggestions.map((profile) => (
                  <ProfileSuggestionItem
                    key={profile.address}
                    profile={profile}
                    onSelect={handleSelectProfile}
                  />
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Success message */}
      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "8px",
            background: "color-mix(in srgb, var(--color-success) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)",
            color: "var(--color-success)",
            fontSize: "0.8rem",
            marginBottom: "12px",
          }}
        >
          <UserCheck size={14} aria-hidden="true" />
          {successMessage}
        </div>
      )}

      {/* Delegate button — opens confirmation dialog */}
      <button
        type="button"
        disabled={!canDelegate}
        onClick={handleOpenDialog}
        style={{
          ...styles.primaryBtn,
          width: "100%",
          justifyContent: "center",
          opacity: canDelegate ? 1 : 0.5,
          cursor: canDelegate ? "pointer" : "not-allowed",
        }}
        aria-disabled={!canDelegate}
      >
        <ArrowRight size={14} aria-hidden="true" />
        {currentDelegate ? "Update Delegate" : "Set Delegate"}
      </button>

      {/* Confirmation dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={styles.dialogOverlay} />
          <Dialog.Content
            style={styles.dialogContent}
            aria-describedby="delegate-confirm-description"
          >
            <Dialog.Title
              style={{
                margin: "0 0 4px",
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "var(--foreground)",
              }}
            >
              Confirm Delegation
            </Dialog.Title>

            <Dialog.Description
              id="delegate-confirm-description"
              style={{ margin: "0 0 20px", fontSize: "0.875rem", color: "var(--text-muted)" }}
            >
              You are about to delegate your voting power to the address below.  This action is
              recorded on-chain and can be changed at any time.
            </Dialog.Description>

            {/* Delegatee summary */}
            {(selectedProfile ?? (isValidStellarAddress(query.trim()) ? { address: query.trim() } : null)) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "var(--muted)",
                  border: "1px solid var(--color-border)",
                  marginBottom: "20px",
                }}
              >
                <div style={styles.avatar}>
                  {getInitials(selectedProfile ?? { address: query.trim() })}
                </div>
                <div>
                  {(selectedProfile?.displayName || selectedProfile?.username) && (
                    <p style={{ margin: 0, fontWeight: 600, color: "var(--foreground)", fontSize: "0.875rem" }}>
                      {selectedProfile?.displayName ?? `@${selectedProfile?.username}`}
                    </p>
                  )}
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                    }}
                  >
                    {selectedProfile?.address ?? query.trim()}
                  </p>
                </div>
              </div>
            )}

            {/* Error message */}
            {submitError && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "color-mix(in srgb, var(--color-error) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-error) 30%, transparent)",
                  color: "var(--color-error)",
                  fontSize: "0.8rem",
                  marginBottom: "16px",
                }}
              >
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
                {submitError}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Dialog.Close asChild>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </Dialog.Close>

              <button
                type="button"
                onClick={handleConfirmDelegate}
                disabled={submitting}
                style={{
                  ...styles.primaryBtn,
                  opacity: submitting ? 0.7 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
                aria-busy={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2
                      size={14}
                      aria-hidden="true"
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    Delegating…
                  </>
                ) : (
                  <>
                    <UserCheck size={14} aria-hidden="true" />
                    Confirm
                  </>
                )}
              </button>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close confirmation dialog"
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "4px",
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Keyframe for spinner — injected once */}
      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  );
}

export default DelegatePanel;
