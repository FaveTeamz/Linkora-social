import { AnalyticsClient } from "../analytics.js";

describe("AnalyticsClient", () => {
  const client = new AnalyticsClient({ baseUrl: "https://oracle.example/" });
  const fetchMock = jest.spyOn(global, "fetch");

  afterEach(() => fetchMock.mockReset());
  afterAll(() => fetchMock.mockRestore());

  it("loads typed creator metrics and reuses the response for five minutes", async () => {
    const payload = {
      creatorAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      period: "30d",
      windowStart: "10",
      windowEnd: "20",
      totalTips: "500",
      postCount: "3",
      followerDelta: "2",
      uniqueTippers: 4,
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(client.getCreatorMetrics(payload.creatorAddress, "30d")).resolves.toEqual(payload);
    await expect(client.getCreatorMetrics(payload.creatorAddress, "30d")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://oracle.example/metrics/creators/${payload.creatorAddress}?period=30d`
    );
  });

  it("loads platform aggregates for the requested period", async () => {
    const payload = {
      period: "7d",
      windowStart: "10",
      windowEnd: "20",
      totalTips: "500",
      postCount: "3",
      followerDelta: "2",
      uniqueTippers: 4,
      creatorCount: 3,
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(client.getPlatformMetrics()).resolves.toEqual(payload);
    expect(fetchMock.mock.calls[0][0]).toBe("https://oracle.example/metrics/platform?period=7d");
  });

  it("refreshes creator metrics after the five-minute cache window", async () => {
    const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    const payload = {
      creatorAddress: address,
      period: "7d",
      windowStart: "10",
      windowEnd: "20",
      totalTips: "0",
      postCount: "0",
      followerDelta: "0",
      uniqueTippers: 0,
    };
    jest.useFakeTimers().setSystemTime(new Date("2026-10-01T00:00:00Z"));
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

    try {
      await client.getCreatorMetrics(address);
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);
      await client.getCreatorMetrics(address);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
