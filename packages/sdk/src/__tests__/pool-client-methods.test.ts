import { InvalidInputError } from "../errors.js";
import { LinkoraClient } from "../client.js";

describe("LinkoraClient pool transaction helpers", () => {
  const client = new LinkoraClient({
    contractId: "CABC123",
    rpcUrl: "https://soroban-testnet.stellar.org",
  });
  const signer = { signTransaction: jest.fn() };

  afterEach(() => jest.restoreAllMocks());

  it("creates a pool through the queue and returns the pool identifier", async () => {
    jest.spyOn(client, "prepareCreatePoolTx").mockResolvedValue("pool-xdr");
    jest.spyOn(client, "submitTransaction").mockResolvedValue("pool-tx-hash");

    await expect(
      client.createPoolAndSubmit("GADMIN", "community", "CTOKEN", ["GADMIN"], 1, signer)
    ).resolves.toEqual({ poolId: "community", transactionHash: "pool-tx-hash" });
  });

  it("rejects zero or negative pool deposits before queue submission", async () => {
    const prepare = jest.spyOn(client, "preparePoolDepositTx");

    await expect(
      client.depositToPoolAndSubmit("GUSER", "community", "CTOKEN", 0, signer)
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      client.depositToPoolAndSubmit("GUSER", "community", "CTOKEN", -1, signer)
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(prepare).not.toHaveBeenCalled();
  });
});
