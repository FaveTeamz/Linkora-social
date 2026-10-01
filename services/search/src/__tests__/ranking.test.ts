import { calculatePostRank, calculateProfileRank } from "../ranking";

describe("Search Ranking Algorithm", () => {
  it("applies recency boost for posts created within 24 hours", () => {
    const now = new Date("2026-09-25T12:00:00Z");

    const recentPost = {
      id: "post_recent",
      author: "GABC",
      content: "Fresh post",
      createdAt: "2026-09-25T10:00:00Z", // 2h ago
      likesCount: 0,
      tipsTotal: 0,
      tsRank: 0.5,
    };

    const oldPost = {
      id: "post_old",
      author: "GABC",
      content: "Old post",
      createdAt: "2026-09-20T10:00:00Z", // 5 days ago
      likesCount: 0,
      tipsTotal: 0,
      tsRank: 0.5,
    };

    const recentScore = calculatePostRank(recentPost, now);
    const oldScore = calculatePostRank(oldPost, now);

    expect(recentScore).toBeCloseTo(0.5 * 1.2, 5);
    expect(oldScore).toBeCloseTo(0.5 * 1.0, 5);
    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it("boosts posts with higher likes and tips", () => {
    const now = new Date("2026-09-25T12:00:00Z");

    const highEngagementPost = {
      id: "post_popular",
      author: "GABC",
      content: "Popular post",
      createdAt: "2026-09-25T10:00:00Z",
      likesCount: 100,
      tipsTotal: 50,
      tsRank: 0.5,
    };

    const zeroEngagementPost = {
      id: "post_empty",
      author: "GABC",
      content: "Empty post",
      createdAt: "2026-09-25T10:00:00Z",
      likesCount: 0,
      tipsTotal: 0,
      tsRank: 0.5,
    };

    const scoreHigh = calculatePostRank(highEngagementPost, now);
    const scoreZero = calculatePostRank(zeroEngagementPost, now);

    expect(scoreHigh).toBeGreaterThan(scoreZero);
  });

  it("boosts exact username match for profile search", () => {
    const exactProfile = {
      address: "G1",
      username: "stellar_dev",
      bio: "Software developer",
      reputationScore: 100,
      tsRank: 0.3,
    };

    const partialProfile = {
      address: "G2",
      username: "other_stellar_dev",
      bio: "Software developer",
      reputationScore: 100,
      tsRank: 0.3,
    };

    const exactScore = calculateProfileRank(exactProfile, "stellar_dev");
    const partialScore = calculateProfileRank(partialProfile, "stellar_dev");

    expect(exactScore).toBeGreaterThan(partialScore);
  });
});
