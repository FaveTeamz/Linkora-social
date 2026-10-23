import { LinkoraClient } from "../client.js";

describe("LinkoraClient indexer feed methods", () => {
  const client = new LinkoraClient({
    contractId: "CABC123",
    rpcUrl: "https://soroban-testnet.stellar.org",
    indexerUrl: "https://indexer.example/",
  });
  const fetchMock = jest.spyOn(global, "fetch");

  afterEach(() => fetchMock.mockReset());
  afterAll(() => fetchMock.mockRestore());

  it("maps latest feed rows into SDK Post values and returns the next offset cursor", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          posts: [
            {
              id: "42",
              author: "GABC",
              content: "Hello",
              tip_total: "10000000",
              like_count: "3",
              created_at: "2026-10-01T00:00:00.000Z",
            },
          ],
          has_more: true,
        }),
        { status: 200 }
      )
    );

    const result = await client.getFeed("latest", "20", 1);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://indexer.example/api/feed?limit=1&offset=20"
    );
    expect(result.nextCursor).toBe("21");
    expect(result.posts[0]).toMatchObject({
      id: 42n,
      author: "GABC",
      content: "Hello",
      timestamp: 1790812800n,
      like_count: 3n,
      tip_total: 10000000n,
    });
  });

  it("uses the indexer trending endpoint and its score cursor", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ posts: [], has_more: false, next_cursor: 900 }), {
        status: 200,
      })
    );

    const result = await client.getFeed("trending", "1000", 10);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://indexer.example/api/feed/explore?limit=10&cursor=1000"
    );
    expect(result.nextCursor).toBe("900");
  });

  it("rejects following feed requests without a viewer address", async () => {
    await expect(client.getFeed("following")).rejects.toThrow(
      "viewerAddress is required for the following feed"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
