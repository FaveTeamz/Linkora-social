import { Account, Contract, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-base";

export const MAX_BATCH_OPERATIONS = 100;

export interface TransactionBatchConfig {
  sourceAccount: Account;
  networkPassphrase: string;
  /** Base fee per operation, in stroops. Defaults to 100. */
  baseFee?: string;
  /** Maximum combined base fee for the complete transaction. Defaults to 10,000 stroops. */
  maxFee?: string;
  /** Maximum operation count for this batch. Defaults to the network cap of 100. */
  maxOperations?: number;
  timeoutSeconds?: number;
}

/** Builds a single Stellar transaction containing several contract operations. */
export class TransactionBatchBuilder {
  private readonly config: Required<TransactionBatchConfig>;
  private readonly operations: xdr.Operation[] = [];

  constructor(config: TransactionBatchConfig) {
    const baseFee = config.baseFee ?? "100";
    const maxFee = config.maxFee ?? "10000";
    if (!/^[1-9]\d*$/.test(baseFee) || !/^[1-9]\d*$/.test(maxFee)) {
      throw new RangeError("baseFee and maxFee must be positive integer strings in stroops");
    }

    const maxOperations = config.maxOperations ?? MAX_BATCH_OPERATIONS;
    if (
      !Number.isSafeInteger(maxOperations) ||
      maxOperations < 1 ||
      maxOperations > MAX_BATCH_OPERATIONS
    ) {
      throw new RangeError(`maxOperations must be from 1 to ${MAX_BATCH_OPERATIONS}`);
    }
    const timeoutSeconds = config.timeoutSeconds ?? 30;
    if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1) {
      throw new RangeError("timeoutSeconds must be a positive integer");
    }

    this.config = { ...config, baseFee, maxFee, maxOperations, timeoutSeconds };
  }

  get operationCount(): number {
    return this.operations.length;
  }

  get estimatedFee(): string {
    return (BigInt(this.config.baseFee) * BigInt(this.operations.length)).toString();
  }

  add(operation: xdr.Operation): this {
    if (this.operations.length >= this.config.maxOperations) {
      throw new RangeError(
        `Batch exceeds the ${this.config.maxOperations}-operation limit for this transaction`
      );
    }

    const nextFee = BigInt(this.config.baseFee) * BigInt(this.operations.length + 1);
    if (nextFee > BigInt(this.config.maxFee)) {
      throw new RangeError(
        `Batch fee ${nextFee} stroops exceeds the configured maximum of ${this.config.maxFee} stroops`
      );
    }

    this.operations.push(operation);
    return this;
  }

  addContractCall(contractId: string, method: string, args: xdr.ScVal[] = []): this {
    if (!method.trim()) throw new TypeError("Contract method name cannot be empty");
    return this.add(new Contract(contractId).call(method, ...args));
  }

  build(): Transaction {
    if (this.operations.length === 0) {
      throw new Error("Cannot build an empty transaction batch");
    }

    const builder = new TransactionBuilder(this.config.sourceAccount, {
      fee: this.config.baseFee,
      networkPassphrase: this.config.networkPassphrase,
    });
    for (const operation of this.operations) builder.addOperation(operation);
    return builder.setTimeout(this.config.timeoutSeconds).build();
  }
}
