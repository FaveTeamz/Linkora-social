import { LinkoraClient } from "../client.js";

describe("LinkoraClient social transaction helpers", () => {
  const follower = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const followee = "GCDGQX3ZFFF6LHBJTQ4C5LYHQ2S4WOFOVSD6WECOCGYUZ6ZJE4CHKGXY";
  const client = new LinkoraClient({
    contractId: "CABC123",
    rpcUrl: "https://soroban-testnet.stellar.org",
  });
  const signer = { signTransaction: jest.fn() };

  afterEach(() => jest.restoreAllMocks());

  it("submits follow transactions using the shared transaction queue", async () => {
    jest.spyOn(client, "prepareFollowTx").mockResolvedValue("follow-xdr");
    const submit = jest.spyOn(client, "submitTransaction").mockResolvedValue("tx-hash");

    await expect(client.submitFollow(follower, followee, signer)).resolves.toBe("tx-hash");
    expect(submit).toHaveBeenCalledWith("follow-xdr", signer, undefined);
  });

  it("submits unfollow transactions through the same queue", async () => {
    jest.spyOn(client, "prepareUnfollowTx").mockResolvedValue("unfollow-xdr");
    const submit = jest.spyOn(client, "submitTransaction").mockResolvedValue("tx-hash");

    await expect(client.submitUnfollow(follower, followee, signer)).resolves.toBe("tx-hash");
    expect(submit).toHaveBeenCalledWith("unfollow-xdr", signer, undefined);
  });

  it("submits block and unblock contract transactions through the queue", async () => {
    jest.spyOn(client, "prepareBlockTx").mockResolvedValue("block-xdr");
    jest.spyOn(client, "prepareUnblockTx").mockResolvedValue("unblock-xdr");
    const submit = jest.spyOn(client, "submitTransaction").mockResolvedValue("tx-hash");

    await expect(client.submitBlock(follower, followee, signer)).resolves.toBe("tx-hash");
    await expect(client.submitUnblock(follower, followee, signer)).resolves.toBe("tx-hash");
    expect(submit).toHaveBeenNthCalledWith(1, "block-xdr", signer, undefined);
    expect(submit).toHaveBeenNthCalledWith(2, "unblock-xdr", signer, undefined);
  });

  it("loads a paginated block list and stops once the final page is reached", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ blocked: ["GONE"], has_more: true }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ blocked: ["GTWO"], has_more: false }), { status: 200 })
      );

    await expect(client.getBlockList(follower)).resolves.toEqual(["GONE", "GTWO"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });

  it("checks following pages until the target is found", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ following: ["GONE"], next_cursor: "100" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ following: ["GTWO"], next_cursor: null }), { status: 200 })
      );

    await expect(client.isFollowing(follower, followee)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
