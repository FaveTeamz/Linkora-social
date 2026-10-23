import { GENERATED_SCHEMA_HASH } from "../generated/schema.js";
import { LinkoraEventSubscriber } from "../events/subscriber.js";

describe("event schema compatibility warning", () => {
  const makeSubscriber = (expectedSchemaHash?: string) =>
    new LinkoraEventSubscriber({
      rpcUrl: "https://soroban-testnet.stellar.org",
      contractId: "CABC123",
      expectedSchemaHash,
    });

  it("warns once on an incompatible remote hash and keeps processing", async () => {
    const subscriber = makeSubscriber();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const process = subscriber as unknown as {
      processWebSocketMessage(data: unknown): Promise<void>;
    };

    await process.processWebSocketMessage({ schemaHash: "different-schema", events: [] });
    await process.processWebSocketMessage({ schemaHash: "different-schema", events: [] });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("schema mismatch");
    warn.mockRestore();
  });

  it("does not warn when the remote hash matches the generated ABI", async () => {
    const subscriber = makeSubscriber();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const process = subscriber as unknown as {
      processWebSocketMessage(data: unknown): Promise<void>;
    };

    await process.processWebSocketMessage({ schemaHash: GENERATED_SCHEMA_HASH, events: [] });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
