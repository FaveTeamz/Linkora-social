import { computeScore, ReputationSignals, scoreToTier } from "../scorer";

const emptySignals: ReputationSignals = {
  followerCount: 0,
  tipTotalStroops: 0n,
  totalLikes: 0,
  postCount: 0,
  govVoteCount: 0,
  credentialVerified: false,
};

describe("computeScore", () => {
  it("returns zero for a bundle with no signals", () => {
    expect(computeScore(emptySignals)).toBe(0);
  });

  it("increases as received tips increase", () => {
    const fewTips = { ...emptySignals, tipTotalStroops: 1_000_000_000n };
    const moreTips = { ...emptySignals, tipTotalStroops: 10_000_000_000n };

    expect(computeScore(moreTips)).toBeGreaterThan(computeScore(fewTips));
  });

  it("applies caller-supplied weights to normalized signals", () => {
    const signals = { ...emptySignals, followerCount: 100_000 };

    expect(
      computeScore(signals, {
        followerCount: 1,
        tipTotalStroops: 0,
        totalLikes: 0,
        postCount: 0,
        govVoteCount: 0,
        credentialVerified: 0,
      })
    ).toBe(10_000);
  });

  it.each([
    [0, "unranked"],
    [999, "unranked"],
    [1_000, "bronze"],
    [2_999, "bronze"],
    [3_000, "silver"],
    [5_999, "silver"],
    [6_000, "gold"],
    [8_499, "gold"],
    [8_500, "diamond"],
    [10_000, "diamond"],
  ] as const)("maps score %i to the %s tier", (score, expectedTier) => {
    expect(scoreToTier(score)).toBe(expectedTier);
  });

  it("clamps out-of-range signals and the final score to 0–10,000", () => {
    const overCap = {
      ...emptySignals,
      followerCount: Number.MAX_SAFE_INTEGER,
      tipTotalStroops: 10n ** 30n,
      totalLikes: Number.MAX_SAFE_INTEGER,
      postCount: Number.MAX_SAFE_INTEGER,
      govVoteCount: Number.MAX_SAFE_INTEGER,
      credentialVerified: true,
    };

    expect(computeScore(overCap)).toBe(10_000);
    expect(computeScore({ ...emptySignals, followerCount: -1 })).toBe(0);
    expect(scoreToTier(20_000)).toBe("diamond");
    expect(scoreToTier(-5)).toBe("unranked");
  });

  it("rejects invalid custom weights", () => {
    expect(() => computeScore(emptySignals, { followerCount: -1 })).toThrow(RangeError);
  });
});
