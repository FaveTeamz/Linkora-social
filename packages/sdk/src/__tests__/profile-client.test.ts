import { ProfileClient } from "../profile-client.js";

describe("ProfileClient", () => {
  const client = new ProfileClient({ indexerUrl: "https://indexer.example/" });
  const fetchMock = jest.spyOn(global, "fetch");

  afterEach(() => fetchMock.mockReset());
  afterAll(() => fetchMock.mockRestore());

  it("resolves exact usernames case-insensitively and caches for one minute", async () => {
    const address = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ address }), { status: 200 })
    );

    await expect(client.resolveUsername(" Alice ")).resolves.toBe(address);
    await expect(client.resolveUsername("alice")).resolves.toBe(address);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://indexer.example/api/profiles/search?username=Alice"
    );
  });

  it("returns null when a username does not exist", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ address: null }), { status: 200 }));

    await expect(client.resolveUsername("unknown")).resolves.toBeNull();
  });
});
