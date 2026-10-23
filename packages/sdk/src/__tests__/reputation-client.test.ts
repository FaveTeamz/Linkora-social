import { ReputationClient } from "../reputation.js";

describe("ReputationClient", () => {
  const client = new ReputationClient({ indexerUrl: "https://indexer.example/" });
  const fetchMock = jest.spyOn(global, "fetch");

  afterEach(() => fetchMock.mockReset());
  afterAll(() => fetchMock.mockRestore());

  it("fetches a user's score from the indexer", async () => {
    const payload = {
      address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      score: 42,
      postsCount: 3,
      tipsSent: 2,
      tipsReceived: 8,
      governanceVotes: 1,
      lastComputedAt: "2026-10-01T00:00:00.000Z",
      updatedLedger: 100,
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(client.getScore(payload.address)).resolves.toEqual(payload);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://indexer.example/api/reputation/${payload.address}`
    );
  });

  it("returns leaderboard entries in indexer order", async () => {
    const entries = [
      {
        address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        score: 42,
        postsCount: 3,
        tipsSent: 2,
        tipsReceived: 8,
        governanceVotes: 1,
        lastComputedAt: "2026-10-01T00:00:00.000Z",
        updatedLedger: 100,
      },
    ];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ entries, limit: 5, offset: 10 }), { status: 200 })
    );

    await expect(client.getLeaderboard(5, 10)).resolves.toEqual(entries);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://indexer.example/api/reputation/leaderboard?limit=5&offset=10"
    );
  });
});
