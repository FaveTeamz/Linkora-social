"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";

const STEPS = [
  { id: "profile", label: "Set up your profile", href: "/profile/edit" },
  { id: "post", label: "Create your first post" },
  { id: "share", label: "Share your profile" },
  { id: "token", label: "Deploy a creator token", href: "/onboarding/creator" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function CreatorOnboardingChecklist() {
  const { address } = useWallet();
  const [completed, setCompleted] = useState<Partial<Record<StepId, boolean>>>({});
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    if (!address) {
      setCompleted({});
      return;
    }

    try {
      const stored = localStorage.getItem(`linkora:creator-onboarding:${address}`);
      setCompleted(stored ? JSON.parse(stored) as Partial<Record<StepId, boolean>> : {});
    } catch {
      setCompleted({});
    }
  }, [address]);

  if (!address) return null;

  const toggleStep = (id: StepId) => {
    setCompleted((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem(`linkora:creator-onboarding:${address}`, JSON.stringify(next));
      return next;
    });
  };

  const shareProfile = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/profile/${address}`);
      setShareMessage("Profile link copied");
    } catch {
      setShareMessage("Could not copy profile link");
    }
  };

  return (
    <section className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Creator checklist</h2>
        <span className="text-sm text-[var(--text-muted)]">
          {STEPS.filter(({ id }) => completed[id]).length} of {STEPS.length} complete
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((step) => (
          <li key={step.id} className="flex min-w-0 items-center gap-3">
            <input
              type="checkbox"
              checked={Boolean(completed[step.id])}
              onChange={() => toggleStep(step.id)}
              aria-label={`Mark ${step.label.toLowerCase()} complete`}
              className="h-4 w-4 shrink-0 accent-[var(--accent-coral)]"
            />
            <span className={`min-w-0 flex-1 text-sm ${completed[step.id] ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"}`}>
              {step.label}
            </span>
            {!completed[step.id] && step.href && (
              <Link href={step.href} className="shrink-0 text-sm font-medium text-[var(--accent-teal)] hover:underline">
                Open
              </Link>
            )}
            {!completed[step.id] && step.id === "post" && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("linkora:open-create-post"))}
                className="shrink-0 text-sm font-medium text-[var(--accent-teal)] hover:underline"
              >
                Open
              </button>
            )}
            {!completed[step.id] && step.id === "share" && (
              <button
                type="button"
                onClick={shareProfile}
                className="shrink-0 text-sm font-medium text-[var(--accent-teal)] hover:underline"
              >
                Copy link
              </button>
            )}
          </li>
        ))}
      </ul>
      {shareMessage && <p role="status" className="mt-3 text-xs text-[var(--text-muted)]">{shareMessage}</p>}
    </section>
  );
}