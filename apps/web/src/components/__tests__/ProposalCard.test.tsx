import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Proposal, ProposalCard } from "../ProposalCard";

const proposal: Proposal = {
  id: 12,
  title: "Increase the voting quorum",
  description: "Set a higher quorum for protocol changes.",
  proposer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  status: "active",
  votesFor: 3,
  votesAgainst: 1,
};

describe("ProposalCard", () => {
  it("renders the proposal details and proposer", () => {
    render(<ProposalCard proposal={proposal} />);

    expect(screen.getByRole("heading", { name: proposal.title })).toBeInTheDocument();
    expect(screen.getByText(proposal.description)).toBeInTheDocument();
    expect(screen.getByText("Proposed by").parentElement).toHaveTextContent("GAAAAA...AAAA");
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it.each(["active", "passed", "rejected", "pending", "executed"] as const)(
    "renders the %s status badge with its status styling",
    (status) => {
      const { container } = render(<ProposalCard proposal={{ ...proposal, status }} />);
      const badge = screen.getByText(status);
      const colorToken = {
        active: "success",
        passed: "info",
        rejected: "error",
        pending: "warning",
        executed: "info",
      }[status];

      expect(badge).toHaveClass("capitalize");
      expect(badge.className).toContain(`--color-${colorToken}`);
      expect(container.querySelector("article")).toBeInTheDocument();
    }
  );

  it("shows the vote ratio in the progress bar", () => {
    render(<ProposalCard proposal={proposal} />);

    expect(screen.getByRole("progressbar", { name: "75% votes for" })).toHaveAttribute(
      "aria-valuenow",
      "75"
    );
  });

  it("does not render voting controls for a non-active proposal", () => {
    render(<ProposalCard proposal={{ ...proposal, status: "passed" }} />);

    expect(screen.queryByRole("button", { name: /vote/i })).not.toBeInTheDocument();
  });

  it("disables voting controls when voting is unavailable", () => {
    render(<ProposalCard proposal={proposal} disabled />);

    expect(screen.getByRole("button", { name: /vote for/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /vote against/i })).toBeDisabled();
  });

  it("sends the selected choice and then prevents a second vote", () => {
    const onVote = jest.fn();
    render(<ProposalCard proposal={proposal} onVote={onVote} />);

    fireEvent.click(screen.getByRole("button", { name: /vote against/i }));

    expect(onVote).toHaveBeenCalledWith(proposal.id, "against");
    expect(screen.getByRole("status")).toHaveTextContent("You voted against.");
    expect(screen.queryByRole("button", { name: /vote for/i })).not.toBeInTheDocument();
  });

  it("shows an existing vote and voting power without exposing vote buttons", () => {
    render(
      <ProposalCard
        proposal={{ ...proposal, userVote: "for", votingPower: 42 }}
        onVote={jest.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("You voted for.");
    expect(screen.getByText("Your voting power: 42")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /vote/i })).not.toBeInTheDocument();
  });
});
