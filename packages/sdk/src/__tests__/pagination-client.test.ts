import { LinkoraClient } from "../client.js";
import { GeneratedLinkoraClient } from "../generated/client.js";
import { decodeCursor } from "../pagination.js";

const client = new LinkoraClient({
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  rpcUrl: "https://rpc.example.com",
});

describe("LinkoraClient cursor pages", () => {
  afterEach(() => jest.restoreAllMocks());

  it("uses a cursor offset for follower pages and returns a next cursor", async () => {
    const getFollowers = jest
      .spyOn(GeneratedLinkoraClient.prototype, "getFollowers")
      .mockResolvedValue(["GONE", "GTWO"]);

    const page = await client.getFollowersPage("GUSER", {
      limit: 2,
      cursor: "eyJmaWVsZCI6Im9mZnNldCIsInZhbHVlIjoyfQ==",
    });

    expect(getFollowers).toHaveBeenCalledWith("GUSER", 2, 2);
    expect(page.items).toEqual(["GONE", "GTWO"]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor!)).toEqual({ field: "offset", value: 4 });
  });

  it("returns no next cursor for a partial page and validates page limits", async () => {
    jest.spyOn(GeneratedLinkoraClient.prototype, "getFollowing").mockResolvedValue(["GONE"]);

    const page = await client.getFollowingPage("GUSER", { limit: 2 });
    expect(page.nextCursor).toBeNull();
    await expect(client.getFollowingPage("GUSER", { limit: 51 })).rejects.toThrow(
      "limit must be an integer from 1 to 50"
    );
  });

  it("uses cursor pages for the author post list", async () => {
    const getPosts = jest
      .spyOn(GeneratedLinkoraClient.prototype, "getPostsByAuthor")
      .mockResolvedValue([1n, 2n]);

    const page = await client.getPostsByAuthorPage("GUSER", { limit: 2 });

    expect(getPosts).toHaveBeenCalledWith("GUSER", 0, 2);
    expect(page.items).toEqual([1n, 2n]);
  });
});
