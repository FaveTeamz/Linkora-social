export interface ReputationActivity {
  postsCount: number;
  tipsSent: number;
  tipsReceived: number;
  governanceVotes: number;
  likesReceived: number;
  followers: number;
  followsMade: number;
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function calculateReputationScore(activity: ReputationActivity): number {
  const score =
    count(activity.postsCount) * 10 +
    count(activity.tipsSent) * 2 +
    count(activity.tipsReceived) * 5 +
    count(activity.governanceVotes) * 5 +
    count(activity.likesReceived) +
    count(activity.followers) * 2 +
    count(activity.followsMade);

  return Math.min(score, Number.MAX_SAFE_INTEGER);
}
