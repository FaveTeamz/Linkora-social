/**
 * Storybook stories for ProposalStatus.
 *
 * Written in Component Story Format (CSF 3) — compatible with Storybook v7+.
 *
 * NOTE: Storybook is not yet installed in this workspace.  To preview these
 * stories, run:
 *
 *   pnpm add -D @storybook/nextjs @storybook/addon-essentials
 *   pnpm storybook
 *
 * The stories will appear under "Governance / ProposalStatus".
 */

import type { Meta, StoryObj } from "@storybook/react";
import { GovStatus } from "linkora-sdk";
import { ProposalStatus } from "./ProposalStatus";

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof ProposalStatus> = {
  title: "Governance/ProposalStatus",
  component: ProposalStatus,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A pill-shaped badge that communicates the status of a governance proposal.  " +
          "All five `GovStatus` variants are supported.  Colours are sourced exclusively " +
          "from CSS custom-property design tokens so the badge adapts to light/dark themes.",
      },
    },
  },
  argTypes: {
    status: {
      control: "select",
      options: Object.values(GovStatus),
      description: "The governance status to display",
    },
    size: {
      control: "radio",
      options: ["sm", "md", "lg"],
      description: "Badge size",
      defaultValue: "md",
    },
  },
};

export default meta;
type Story = StoryObj<typeof ProposalStatus>;

// ── Individual variant stories ────────────────────────────────────────────────

/** A proposal currently open for voting. */
export const Active: Story = {
  args: { status: GovStatus.Active, size: "md" },
};

/** A proposal that reached quorum and is awaiting execution. */
export const Passed: Story = {
  args: { status: GovStatus.Passed, size: "md" },
};

/** A proposal that has been executed on-chain. */
export const Executed: Story = {
  args: { status: GovStatus.Executed, size: "md" },
};

/** A proposal that was vetoed by pool admins. */
export const Vetoed: Story = {
  args: { status: GovStatus.Vetoed, size: "md" },
};

/** A proposal that did not reach quorum within the vote window. */
export const Failed: Story = {
  args: { status: GovStatus.Failed, size: "md" },
};

// ── All variants in one row ───────────────────────────────────────────────────

/**
 * Shows every status variant side-by-side for a quick visual comparison.
 */
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
      {Object.values(GovStatus).map((status) => (
        <ProposalStatus key={status} status={status} />
      ))}
    </div>
  ),
};

// ── Size comparison ───────────────────────────────────────────────────────────

/**
 * Shows the Active badge at all three supported sizes.
 */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
      <ProposalStatus status={GovStatus.Active} size="sm" />
      <ProposalStatus status={GovStatus.Active} size="md" />
      <ProposalStatus status={GovStatus.Active} size="lg" />
    </div>
  ),
};
