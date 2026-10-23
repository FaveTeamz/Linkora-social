import { Account, Contract, Keypair } from "@stellar/stellar-base";
import { MAX_BATCH_OPERATIONS, TransactionBatchBuilder } from "../batch.js";

const networkPassphrase = "Test SDF Network ; September 2015";
const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

function makeBatch(overrides: Partial<ConstructorParameters<typeof TransactionBatchBuilder>[0]> = {}) {
  return new TransactionBatchBuilder({
    sourceAccount: new Account(Keypair.random().publicKey(), "1"),
    networkPassphrase,
    ...overrides,
  });
}

describe("TransactionBatchBuilder", () => {
  it("builds a single-operation transaction", () => {
    const batch = makeBatch();
    batch.addContractCall(contractId, "set_fee");

    const transaction = batch.build();
    expect(transaction.operations).toHaveLength(1);
    expect(batch.estimatedFee).toBe("100");
  });

  it("combines multiple contract calls into one transaction", () => {
    const batch = makeBatch();
    batch
      .addContractCall(contractId, "set_fee")
      .add(new Contract(contractId).call("set_treasury"));

    expect(batch.operationCount).toBe(2);
    expect(batch.estimatedFee).toBe("200");
    expect(batch.build().operations).toHaveLength(2);
  });

  it("rejects batches whose combined base fee exceeds the configured maximum", () => {
    const batch = makeBatch({ baseFee: "100", maxFee: "150" });
    batch.addContractCall(contractId, "set_fee");

    expect(() => batch.addContractCall(contractId, "set_fee")).toThrow(
      "Batch fee 200 stroops exceeds the configured maximum of 150 stroops"
    );
    expect(batch.operationCount).toBe(1);
  });

  it("rejects a batch that exceeds its operation limit", () => {
    const batch = makeBatch({ maxOperations: 2 });
    batch.addContractCall(contractId, "set_fee").addContractCall(contractId, "set_fee");

    expect(() => batch.addContractCall(contractId, "set_fee")).toThrow(
      "Batch exceeds the 2-operation limit for this transaction"
    );
    expect(MAX_BATCH_OPERATIONS).toBeGreaterThanOrEqual(2);
  });

  it("does not build an empty transaction", () => {
    expect(() => makeBatch().build()).toThrow("Cannot build an empty transaction batch");
  });
});
