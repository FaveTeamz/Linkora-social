import * as rpc from "@stellar/stellar-sdk/rpc";
import {
  Contract,
  nativeToScVal,
  scValToNative,
  Transaction,
  TransactionBuilder,
  Account,
  Address,
  Keypair,
  Operation,
  StrKey,
  xdr,
} from "@stellar/stellar-base";
import { GeneratedLinkoraClient } from "./generated/client.js";
import { Profile, Post, Pool, SimulationResult, LedgerFootprint } from "./types.js";
import {
  mapError,
  NotFoundError,
  UnauthorizedError,
  SimulationError,
  ValidationError,
  InvalidInputError,
  NetworkError,
  LinkoraError,
  VersionMismatchError,
  InsufficientBalanceError,
  ReadResult,
} from "./errors.js";
import { ClassicAccountClient, ClassicBalance } from "./classic.js";
import { GovParameter, GovStatus } from "./generated/types.js";
import type { GovProposal, GovParameter as GovParameterType } from "./generated/types.js";
import { ConnectionHealthMonitor, HealthCheckConfig, ConnectionStatusCallback } from "./health.js";
import { fetchWithTimeout } from "./utils/fetch.js";
import type { QueueSigner, RunOptions } from "./queue.js";
import { submitTransaction } from "./submit.js";
import { decodeOffsetCursor, makeCursorPage, type CursorPage } from "./pagination.js";

const { isSimulationError, isSimulationSuccess } = rpc.Api;

const DEFAULT_NETWORK = "Test SDF Network ; September 2015";
const DEFAULT_TIMEOUT = 30;
const MAX_BYTES = 64 * 1024; // 64KB max limit for Soroban host function byte arguments
const MAX_POST_CONTENT_LENGTH = 500;

function validatePostContent(content: string): void {
  ensureNonEmptyString(content, "content");
  if (content.length > MAX_POST_CONTENT_LENGTH) {
    throw new InvalidInputError(`content must be at most ${MAX_POST_CONTENT_LENGTH} characters.`);
  }
}

/**
 * Detect whether a hostname refers to the local machine (loopback only).
 * `localhost`, `127.0.0.0/8` and `[::1]` are considered local. Anything else
 * (including LAN addresses) is treated as remote.
 */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost") return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return host === "::1" || host === "0:0:0:0:0:0:0:1";
}

/**
 * Resolve the effective `allowHttp` setting.
 *
 * Insecure `http://` is rejected unless explicitly opted-in. Local (loopback)
 * hosts may opt in via `allowHttp: true` (development networks). Non-loopback
 * `http://` hosts are always rejected — even when `allowHttp: true` — so that a
 * misconfigured public RPC can never transit transaction/XDR data in plaintext.
 */
function resolveAllowHttp(config: { rpcUrl: string; allowHttp?: boolean }): boolean {
  const explicit = Boolean(config.allowHttp);
  const isHttp = config.rpcUrl.startsWith("http://");
  if (!isHttp) return explicit ? true : false;

  let hostname = "";
  try {
    hostname = new URL(config.rpcUrl).hostname;
  } catch {
    hostname = config.rpcUrl;
  }

  const local = isLoopbackHost(hostname);

  if (!explicit) {
    throw new Error(
      `Refusing to use insecure HTTP RPC at "${config.rpcUrl}". ` +
        `Local development RPCs must opt in explicitly by passing allowHttp: true. ` +
        `Use an https:// RPC URL for any remote endpoint.`
    );
  }

  if (!local) {
    throw new Error(
      `Refusing to use insecure HTTP RPC at "${config.rpcUrl}". ` +
        `Plaintext HTTP is only permitted for local (loopback) development endpoints. ` +
        `Use an https:// RPC URL.`
    );
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[linkora-sdk] Warning: connecting to an insecure HTTP RPC at "${config.rpcUrl}". ` +
      `This is intended for local development only and should never be used with a ` +
      `production or mainnet endpoint.`
  );

  return true;
}

function scvAddress(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "address" });
}
function scvString(value: string): xdr.ScVal {
  return nativeToScVal(value);
}
function scvU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}
function scvU64(value: number | bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}
function scvSymbol(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "symbol" });
}
function scvI128(value: number | bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}
function scvAddressVec(value: string[]): xdr.ScVal {
  return nativeToScVal(
    value.map((addr) => Address.fromString(addr)),
    { type: "vec" }
  );
}

function ensureNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidInputError(`${fieldName} must be a non-empty string.`);
  }
}

function isValidContractAddress(value: string): boolean {
  try {
    return StrKey.isValidContract(value);
  } catch {
    return false;
  }
}

function ensureAddress(value: string, fieldName: string): void {
  ensureNonEmptyString(value, fieldName);
  if (!StrKey.isValidEd25519PublicKey(value) && !isValidContractAddress(value)) {
    throw new InvalidInputError(
      `${fieldName} must be a valid Stellar public key or contract address.`
    );
  }
}

function ensureAddressList(values: string[], fieldName: string): void {
  if (!Array.isArray(values)) {
    throw new ValidationError(`${fieldName} must be an array of Stellar public keys.`);
  }
  values.forEach((value, index) => ensureAddress(value, `${fieldName}[${index}]`));
}

function ensureInteger(value: number | bigint, fieldName: string, min = 0): bigint {
  if (typeof value === "bigint") {
    if (value < BigInt(min)) {
      throw new InvalidInputError(`${fieldName} must be greater than or equal to ${min}.`);
    }
    return value;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new InvalidInputError(`${fieldName} must be an integer.`);
  }

  if (value < min) {
    throw new InvalidInputError(`${fieldName} must be greater than or equal to ${min}.`);
  }

  return BigInt(value);
}

function ensurePositiveInteger(value: number | bigint, fieldName: string): bigint {
  return ensureInteger(value, fieldName, 1);
}

function normalizeDate(value: Date | string | undefined, fieldName: string): Date | undefined {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date.`);
  }
  return date;
}

function normalizeTipRecord(value: Record<string, unknown>): TipRecord {
  const postId = value.post_id ?? value.postId;
  const createdAt = value.created_at ?? value.createdAt;
  const amount = value.amount;
  const fee = value.fee;
  const id = Number(value.id);
  const timestamp = createdAt instanceof Date ? createdAt : new Date(String(createdAt));
  if (!Number.isSafeInteger(id) || Number.isNaN(timestamp.getTime())) {
    throw new LinkoraError("Indexer returned an invalid tip record.", "INVALID_RESPONSE");
  }
  try {
    const normalizedPostId = BigInt(postId as string | number | bigint);
    const normalizedAmount = BigInt(amount as string | number | bigint);
    const normalizedFee = BigInt(fee as string | number | bigint);
    const tipper = String(value.tipper ?? "");
    const txHash = String(value.tx_hash ?? value.txHash ?? "");
    if (
      normalizedPostId <= 0n ||
      normalizedAmount <= 0n ||
      normalizedFee < 0n ||
      normalizedFee > normalizedAmount ||
      !tipper ||
      !txHash
    ) {
      throw new Error("Tip record fields are outside their valid range.");
    }
    return {
      id,
      tipper,
      post_id: normalizedPostId,
      amount: normalizedAmount,
      fee: normalizedFee,
      created_at: timestamp,
      tx_hash: txHash,
    };
  } catch (cause) {
    throw new LinkoraError("Indexer returned an invalid tip record.", "INVALID_RESPONSE", undefined, cause);
  }
}

function ensureGovParameter(parameter: GovParameter): void {
  const valid = Object.values(GovParameter).includes(parameter);
  if (!valid) {
    throw new InvalidInputError(
      `parameter must be one of: ${Object.values(GovParameter).join(", ")}.`
    );
  }
}

function ensureMaxBytes(value: Uint8Array, fieldName: string, maxBytes: number = MAX_BYTES): void {
  if (value.length > maxBytes) {
    throw new ValidationError(
      `${fieldName} exceeds maximum allowed size of ${maxBytes} bytes (got ${value.length} bytes).`
    );
  }
}

export interface ClientConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase?: string;
  /** Contract ID of the token factory contract */
  tokenFactoryId?: string;
  /** Connection health-check options */
  healthCheck?: HealthCheckConfig & { autoStart?: boolean };
  /** Timeout in ms for HTTP requests (default 30 000). */
  timeoutMs?: number;
  /**
   * Allow insecure `http://` RPC connections (local development networks only).
   *
   * Insecure HTTP is **disabled by default**. To use a local development RPC
   * over plaintext `http://` (e.g. `http://localhost:8000`), explicitly set
   * this to `true`. Non-localhost `http://` RPC URLs are always rejected
   * (even with this flag set) to keep sensitive transaction/XDR data from
   * transiting in the clear — see {@link ClientConfig.allowHttp}.
   */
  allowHttp?: boolean;
  /** Horizon URL for account sequence fetching. If not provided, defaults based on networkPassphrase. */
  horizonUrl?: string;
  /** Base URL for the indexer REST API (defaults to http://localhost:3001). */
  indexerUrl?: string;
}

export type FeedFilter = "latest" | "trending" | "following";

export interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
}

interface IndexerPost {
  id: string | number;
  author: string;
  content: string;
  tip_total?: string | number;
  like_count?: string | number;
  created_at?: string;
  timestamp?: string | number;
}

export interface DeployCreatorTokenParams {
  deployer: string;
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: bigint;
}

export interface GovernanceProposalListOptions {
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface GovernanceProposalList {
  proposals: GovProposal[];
  nextCursor: string | null;
}

export interface SetProfileWithNewTokenParams {
  user: string;
  username: string;
  tokenParams: Omit<DeployCreatorTokenParams, "deployer">;
}

export interface CursorPageOptions {
  limit?: number;
  cursor?: string | null;
}

const MAX_CURSOR_PAGE_SIZE = 50;

function normalizeCursorPage(options: CursorPageOptions = {}): { limit: number; offset: number } {
  const limit = options.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CURSOR_PAGE_SIZE) {
    throw new InvalidInputError(`limit must be an integer from 1 to ${MAX_CURSOR_PAGE_SIZE}`);
  }
  return { limit, offset: decodeOffsetCursor(options.cursor) };
}

/**
 * Typed client for all Linkora social contract methods.
 *
 * Extends the auto-generated GeneratedLinkoraClient with connection management,
 * error handling, and type conversions (e.g. bigint ↔ number).
 */
export class LinkoraClient extends GeneratedLinkoraClient {
  public readonly classic: ClassicAccountClient;
  private tokenFactoryId?: string;
  private readonly _rpcUrl: string;
  private readonly _networkPassphrase: string;
  private readonly _contractId: string;
  private readonly _healthMonitor: ConnectionHealthMonitor;
  private readonly _timeoutMs: number;
  private readonly _allowHttp: boolean;
  private readonly _horizonUrl?: string;
  private readonly _indexerUrl: string;
  private readonly _rpcServer: rpc.Server;
  private readonly _indexerUrl: string;

  constructor(config: ClientConfig) {
    super({
      contractId: config.contractId,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.networkPassphrase || DEFAULT_NETWORK,
      allowHttp: config.allowHttp,
    });
    this._contractId = config.contractId;
    this.tokenFactoryId = config.tokenFactoryId;
    this._rpcUrl = config.rpcUrl;
    this._networkPassphrase = config.networkPassphrase || DEFAULT_NETWORK;
    this._timeoutMs = config.timeoutMs ?? 30_000;
    this._allowHttp = resolveAllowHttp({ rpcUrl: config.rpcUrl, allowHttp: config.allowHttp });
    this._horizonUrl = config.horizonUrl;
    this._indexerUrl = (config.indexerUrl ?? "http://localhost:3001").replace(/\/$/, "");

    this._rpcServer = new rpc.Server(this._rpcUrl, { allowHttp: this._allowHttp });
    this._indexerUrl = (config.indexerUrl ?? "http://localhost:3001/api").replace(/\/$/, "");

    this.classic = new ClassicAccountClient({
      networkPassphrase: this._networkPassphrase,
      horizonUrl: this._horizonUrl,
      timeoutMs: this._timeoutMs,
    });

    const { autoStart, ...healthCfg } = config.healthCheck ?? {};
    this._healthMonitor = new ConnectionHealthMonitor(this._rpcUrl, healthCfg, this._rpcServer);
    if (autoStart) this._healthMonitor.start();
  }

  /** Get the shared client-wide RPC server instance. */
  public get rpcServer(): rpc.Server {
    return this._rpcServer;
  }

  /** Return the client-wide RPC server handle. */
  public createRpcServer(): rpc.Server {
    return this._rpcServer;
  }

  /**
   * Convenience method to sign and submit a transaction using the TransactionQueue.
   *
   * @param xdrOrTx The transaction to submit (base64 XDR string or Transaction object).
   * @param signer The wallet signer.
   * @param opts Optional run options.
   * @returns The transaction hash.
   */
  async submitTransaction(
    xdrOrTx: string | Transaction,
    signer: QueueSigner,
    opts?: RunOptions
  ): Promise<string> {
    return submitTransaction(this, xdrOrTx, signer, opts);
  }

  /** Fetch a cursor-paginated feed from the indexer. */
  async getFeed(
    filter: FeedFilter = "latest",
    cursor?: string,
    limit = 20,
    viewerAddress?: string
  ): Promise<FeedPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new InvalidInputError("limit must be an integer between 1 and 100.");
    }
    const params = new URLSearchParams({ limit: String(limit) });
    let path: string;
    if (filter === "latest") {
      const offset = cursor === undefined ? 0 : Number(cursor);
      if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new InvalidInputError("latest feed cursor must be a non-negative offset.");
      }
      params.set("offset", String(offset));
      path = "/api/feed";
    } else if (filter === "trending") {
      if (cursor !== undefined) params.set("cursor", cursor);
      path = "/api/feed/explore";
    } else {
      if (!viewerAddress) {
        throw new InvalidInputError("viewerAddress is required for the following feed.");
      }
      ensureAddress(viewerAddress, "viewerAddress");
      if (cursor !== undefined) params.set("cursor", cursor);
      path = `/api/feed/following/${encodeURIComponent(viewerAddress)}`;
    }

    const response = await fetchWithTimeout(
      `${this._indexerUrl}${path}?${params.toString()}`,
      { headers: { Accept: "application/json" } },
      this._timeoutMs
    );
    if (!response.ok) {
      throw new NetworkError(`Indexer feed request failed with HTTP ${response.status}.`, {
        status: response.status,
        path,
      });
    }
    const result = (await response.json()) as {
      posts?: IndexerPost[];
      has_more?: boolean;
      next_cursor?: string | number | null;
    };
    const posts = (result.posts ?? []).map((post) => this.mapIndexerPost(post));
    const nextCursor =
      result.next_cursor !== undefined
        ? (result.next_cursor === null ? null : String(result.next_cursor))
        : result.has_more && posts.length > 0
          ? String(Number(cursor ?? "0") + posts.length)
          : null;
    return { posts, nextCursor };
  }

  /** Fetch all blocked addresses for an account, following the indexer's pages. */
  async getBlockList(address: string): Promise<string[]> {
    ensureAddress(address, "address");
    const blocked: string[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      const path = `/api/users/${encodeURIComponent(address)}/blocked?${params.toString()}`;
      const response = await fetchWithTimeout(
        `${this._indexerUrl}${path}`,
        { headers: { Accept: "application/json" } },
        this._timeoutMs
      );
      if (!response.ok) {
        throw new NetworkError(`Indexer block-list request failed with HTTP ${response.status}.`, {
          status: response.status,
          address,
        });
      }
      const result = (await response.json()) as { blocked?: string[]; has_more?: boolean };
      const page = result.blocked ?? [];
      blocked.push(...page);
      if (!result.has_more || page.length === 0) return blocked;
      offset += page.length;
    }
  }

  /** Check an indexed follow list, stopping as soon as the target is found. */
  async isFollowing(follower: string, followee: string): Promise<boolean> {
    ensureAddress(follower, "follower");
    ensureAddress(followee, "followee");
    let cursor = 0;
    const limit = 100;
    while (true) {
      const params = new URLSearchParams({ limit: String(limit), cursor: String(cursor) });
      const path = `/api/follows/${encodeURIComponent(follower)}/following?${params.toString()}`;
      const response = await fetchWithTimeout(
        `${this._indexerUrl}${path}`,
        { headers: { Accept: "application/json" } },
        this._timeoutMs
      );
      if (!response.ok) {
        throw new NetworkError(`Indexer following request failed with HTTP ${response.status}.`, {
          status: response.status,
          follower,
        });
      }
      const result = (await response.json()) as {
        following?: string[];
        next_cursor?: string | null;
      };
      const page = result.following ?? [];
      if (page.includes(followee)) return true;
      if (result.next_cursor === null || result.next_cursor === undefined || page.length === 0) {
        return false;
      }
      const next = Number(result.next_cursor);
      if (!Number.isSafeInteger(next) || next <= cursor) {
        throw new NetworkError("Indexer returned an invalid following cursor.", {
          cursor: result.next_cursor,
        });
      }
      cursor = next;
    }
  }

  private mapIndexerPost(post: IndexerPost): Post {
    const rawTimestamp = post.timestamp ?? post.created_at ?? 0;
    const timestamp =
      typeof rawTimestamp === "string" && !/^\d+$/.test(rawTimestamp)
        ? Math.floor(Date.parse(rawTimestamp) / 1000)
        : Number(rawTimestamp);
    if (!Number.isFinite(timestamp)) {
      throw new NetworkError("Indexer returned a post with an invalid timestamp.", {
        postId: post.id,
      });
    }
    return {
      id: BigInt(post.id),
      author: post.author,
      content: post.content,
      timestamp: BigInt(timestamp),
      like_count: BigInt(post.like_count ?? 0),
      tip_total: BigInt(post.tip_total ?? 0),
    };
  }

  /**
   * Ping the RPC endpoint once. Returns true if reachable.
   *
   * @returns A promise that resolves to true if the node responds successfully, false otherwise.
   *
   * @example
   * ```ts
   * const isHealthy = await client.healthCheck();
   * if (!isHealthy) {
   *   console.warn("RPC node is unreachable");
   * }
   * ```
   */
  healthCheck(): Promise<boolean> {
    return this._healthMonitor.healthCheck();
  }

  /**
   * Register a callback for connection status changes ("connected" | "disconnected").
   * Starts the periodic health-check loop on first call if not already running.
   * Re-registering the same callback reference is a no-op, so this is safe to call
   * repeatedly with a stable callback (e.g. from a React effect on every render).
   *
   * @param callback Function invoked when the connection state transitions.
   * @returns An unsubscribe function that removes this listener.
   *
   * @example
   * ```ts
   * client.onConnectionStatusChange((status) => {
   *   if (status === "disconnected") {
   *     console.error("Lost connection to Soroban RPC!");
   *   } else {
   *     console.log("Connected to Soroban RPC.");
   *   }
   * });
   * ```
   */
  onConnectionStatusChange(callback: ConnectionStatusCallback): () => void {
    return this._healthMonitor.onConnectionStatusChange(callback);
  }

  /**
   * Stop the periodic health-check loop.
   *
   * @example
   * ```ts
   * // Clean up resources when shutting down
   * client.stopHealthChecks();
   * ```
   */
  stopHealthChecks(): void {
    this._healthMonitor.stop();
  }

  // ── Soroban simulation and transaction preparation ─────────────────────────

  /**
   * Simulate a write operation and return fee and footprint information.
   * Uses a fresh op factory each call to avoid XDR object reuse across transactions.
   *
   * @param method The contract method to invoke.
   * @param args The arguments to pass to the method, encoded as `xdr.ScVal`.
   *
   * @returns The simulation result, containing the resource fee and ledger footprint.
   *
   * @throws {SimulationError} If the simulation fails (e.g., due to a contract trap or missing authorization).
   *
   * @see {@link https://developers.stellar.org/docs/learn/smart-contract-transactions/simulate-transaction Stellar Simulation Docs}
   *
   * @example
   * ```ts
   * import { nativeToScVal } from "@stellar/stellar-sdk";
   *
   * try {
   *   const result = await client.simulate(
   *     "follow",
   *     nativeToScVal("GBFOY...", { type: "address" }),
   *     nativeToScVal("GCO23...", { type: "address" })
   *   );
   *   console.log("Estimated fee:", result.resourceFee);
   * } catch (error) {
   *   console.error("Simulation failed:", error.message);
   * }
   * ```
   */
  async simulate(method: string, ...args: xdr.ScVal[]): Promise<SimulationResult> {
    const server = this._rpcServer;
    const contract = new Contract(this._contractId);
    const buildOp = () => contract.call(method, ...args);

    const source = Keypair.random();
    const account = new Account(source.publicKey(), "0");
    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this._networkPassphrase,
    })
      .addOperation(buildOp())
      .setTimeout(DEFAULT_TIMEOUT)
      .build();

    const result = await server.simulateTransaction(tx);

    if (isSimulationError(result)) {
      throw new SimulationError(
        `Transaction simulation failed: ${result.error}`,
        result.events,
        result.error
      );
    }

    if (!isSimulationSuccess(result) || !result.result) {
      throw new SimulationError("Unknown simulation error", undefined, result);
    }

    const resourceFee = result.minResourceFee || "0";

    let footprint: LedgerFootprint = { readOnly: [], readWrite: [] };
    if (result.transactionData) {
      try {
        const built = result.transactionData.build();
        footprint = {
          readOnly: built
            .resources()
            .footprint()
            .readOnly()
            .map((e: unknown) => JSON.stringify(e)),
          readWrite: built
            .resources()
            .footprint()
            .readWrite()
            .map((e: unknown) => JSON.stringify(e)),
        };
      } catch {
        // Keep empty footprint if structure extraction fails
      }
    }

    return { success: true, resourceFee, footprint };
  }

  /**
   * Prepare a transaction for signing by simulating it with a temp keypair, then
   * building the real tx for sourceAccount with injected fees and footprint.
   * The operation is built independently for each transaction to avoid XDR state sharing.
   *
   * @param method The contract method to invoke.
   * @param sourceAccount The actual Stellar account that will sign and execute the transaction.
   * @param args The arguments to pass to the method, encoded as `xdr.ScVal`.
   *
   * @returns The prepared, unsigned `Transaction` ready for authorization.
   *
   * @throws {SimulationError} If preparing the transaction fails during simulation.
   *
   * @see {@link https://developers.stellar.org/docs/learn/fundamentals/transactions Stellar Transactions Docs}
   *
   * @example
   * ```ts
   * import { Account, nativeToScVal } from "@stellar/stellar-sdk";
   *
   * const sourceAccount = new Account("GBFOY...", "1234567890");
   * try {
   *   const tx = await client.prepareTransaction(
   *     "create_post",
   *     sourceAccount,
   *     nativeToScVal("GBFOY...", { type: "address" }),
   *     nativeToScVal("Hello World")
   *   );
   *   console.log("Prepared transaction XDR:", tx.toEnvelope().toXDR("base64"));
   * } catch (error) {
   *   console.error("Failed to prepare transaction:", error.message);
   * }
   * ```
   */
  async prepareTransaction(
    method: string,
    sourceAccount: Account,
    ...args: xdr.ScVal[]
  ): Promise<Transaction> {
    return this.prepareTransactionOnContract(method, this._contractId, sourceAccount, ...args);
  }

  /**
   * Like {@link prepareTransaction}, but builds the Soroban invocation against an
   * arbitrary contract (e.g. a SEP-41 token contract) instead of the Linkora
   * contract. Used to prepare the token `increase_allowance` pre-approval step.
   */
  private async prepareTransactionOnContract(
    method: string,
    contractId: string,
    sourceAccount: Account,
    ...args: xdr.ScVal[]
  ): Promise<Transaction> {
    const server = this.createRpcServer();
    const contract = new Contract(contractId);

    const rawTx = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: this._networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(DEFAULT_TIMEOUT)
      .build();

    const simulationResult = await server.simulateTransaction(rawTx);

    if (isSimulationError(simulationResult)) {
      throw new SimulationError(
        `Transaction preparation failed: ${simulationResult.error}`,
        simulationResult.events,
        simulationResult.error
      );
    }

    if (!isSimulationSuccess(simulationResult) || !simulationResult.result) {
      throw new SimulationError(
        "Unknown simulation error during transaction preparation",
        undefined,
        simulationResult
      );
    }

    // assembleTransaction applies resource fees, soroban transaction data and
    // the auth entries produced by simulation (required by require_auth()).
    return rpc.assembleTransaction(rawTx, simulationResult).build() as Transaction;
  }

  /**
   * Build a multi-operation transaction with multiple Soroban invocations.
   * Operations are freshly constructed for both the simulation and the real transaction
   * to avoid XDR object reuse across different TransactionBuilder instances.
   *
   * @param sourceAccount The Stellar account that will pay the fees and provide sequence.
   * @param ops An array of operations specifying the method names and their arguments.
   *
   * @returns The prepared, unsigned multi-operation `Transaction`.
   *
   * @throws {SimulationError} If the combined simulation of the operations fails.
   *
   * @example
   * ```ts
   * import { Account, nativeToScVal } from "@stellar/stellar-sdk";
   *
   * const sourceAccount = new Account("GBFOY...", "1234567890");
   * try {
   *   const tx = await client.buildMultiOpTx(sourceAccount, [
   *     {
   *       method: "follow",
   *       args: [
   *         nativeToScVal("GBFOY...", { type: "address" }),
   *         nativeToScVal("GCO23...", { type: "address" })
   *       ]
   *     },
   *     {
   *       method: "like_post",
   *       args: [
   *         nativeToScVal("GBFOY...", { type: "address" }),
   *         nativeToScVal(42, { type: "u32" })
   *       ]
   *     }
   *   ]);
   *   console.log("Prepared multi-op transaction hash:", tx.hash().toString("hex"));
   * } catch (error) {
   *   console.error("Failed to build multi-op transaction:", error.message);
   * }
   * ```
   */
  async buildMultiOpTx(
    sourceAccount: Account,
    ops: Array<{ method: string; args: xdr.ScVal[] }>
  ): Promise<Transaction> {
    const server = this._rpcServer;
    const contract = new Contract(this._contractId);

    const tempSource = Keypair.random();
    const tempAccount = new Account(tempSource.publicKey(), "0");
    const tempBuilder = new TransactionBuilder(tempAccount, {
      fee: "100",
      networkPassphrase: this._networkPassphrase,
    });
    for (const op of ops) {
      tempBuilder.addOperation(contract.call(op.method, ...op.args));
    }
    const tempTx = tempBuilder.setTimeout(DEFAULT_TIMEOUT).build();

    const simulationResult = await server.simulateTransaction(tempTx);

    if (isSimulationError(simulationResult)) {
      throw new SimulationError(
        `Multi-operation transaction simulation failed: ${simulationResult.error}`,
        simulationResult.events,
        simulationResult.error
      );
    }

    if (!isSimulationSuccess(simulationResult) || !simulationResult.result) {
      throw new SimulationError(
        "Unknown simulation error during multi-op transaction preparation",
        undefined,
        simulationResult
      );
    }

    // rpc.assembleTransaction only supports single-invoke transactions, so for
    // multi-op transactions apply each op's simulated auth entries manually.
    const results = Array.isArray(simulationResult.result) ? simulationResult.result : [];

    if (results.length !== ops.length) {
      throw new SimulationError(
        `Multi-operation simulation result mismatch: expected ${ops.length} auth entries for ${ops.length} operations, got ${results.length}`,
        undefined,
        simulationResult.result
      );
    }

    for (let i = 0; i < results.length; i += 1) {
      const result = results[i] as { auth?: unknown } | undefined;
      if (!result || !Array.isArray(result.auth)) {
        throw new SimulationError(
          `Multi-operation simulation result mismatch: missing auth array for operation ${i} (expected ${ops.length} entries total)`,
          undefined,
          result
        );
      }
    }

    const realBuilder = new TransactionBuilder(sourceAccount, {
      fee: String(Number(simulationResult.minResourceFee || "0") + 100),
      networkPassphrase: this._networkPassphrase,
    });
    ops.forEach((opDef, i) => {
      const func = xdr.HostFunction.hostFunctionTypeInvokeContract(
        new xdr.InvokeContractArgs({
          contractAddress: (
            new Contract(this._contractId) as unknown as {
              address(): { toScAddress(): xdr.ScAddress };
            }
          )
            .address()
            .toScAddress(),
          functionName: opDef.method,
          args: opDef.args,
        })
      );
      const auth = (results as unknown as Array<{ auth?: xdr.SorobanAuthorizationEntry[] }>)[i]
        ?.auth;
      realBuilder.addOperation(
        Operation.invokeHostFunction({
          func,
          auth: auth ?? [],
        })
      );
    });

    let readyBuilder = realBuilder.setTimeout(DEFAULT_TIMEOUT);

    const sorobanData = simulationResult.transactionData;
    if (sorobanData) {
      readyBuilder = readyBuilder.setSorobanData(sorobanData.build());
    }

    return readyBuilder.build() as Transaction;
  }

  // TODO(#1044): Add pagination support (cursor, limit params) to event fetching methods
  // ── Override read methods with error handling ─────────────────────────────

  /**
   * Fetch a user profile by address.
   *
   * @param address The Stellar public key of the user.
   * @returns The user's Profile, or null if not found.
   *
   * @example
   * ```ts
   * const profile = await client.getProfile("GBFOY...");
   * if (profile) {
   *   console.log(`Username: ${profile.username}`);
   * } else {
   *   console.log("Profile not found.");
   * }
   * ```
   */
  async getProfile(address: string): Promise<Profile | null> {
    try {
      return await super.getProfile(address);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  /**
   * Get the total number of profiles registered on the platform.
   *
   * @returns The total profile count.
   *
   * @example
   * ```ts
   * const count = await client.getProfileCount();
   * console.log(`Total users: ${count.toString()}`);
   * ```
   */
  async getProfileCount(): Promise<bigint> {
    return super.getProfileCount();
  }

  /**
   * Fetch a post by its ID.
   *
   * @param postId The ID of the post.
   * @returns The Post object, or null if it does not exist.
   *
   * @example
   * ```ts
   * const post = await client.getPost(123n);
   * if (post) {
   *   console.log(`Post content: ${post.content}`);
   * } else {
   *   console.log("Post not found.");
   * }
   * ```
   */
  async getPost(postId: number | bigint): Promise<Post | null> {
    try {
      return await super.getPost(BigInt(postId));
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  /**
   * Get the total number of posts created on the platform.
   *
   * @returns The total post count.
   *
   * @example
   * ```ts
   * const count = await client.getPostCount();
   * console.log(`Total posts: ${count.toString()}`);
   * ```
   */
  async getPostCount(): Promise<bigint> {
    return super.getPostCount();
  }

  /**
   * Fetch the configured maximum post content length from the contract.
   *
   * Falls back to the Rust default `MAX_CONTENT_LEN` (280 bytes, defined in
   * `packages/contracts/contracts/linkora-contracts/src/validation.rs`) when
   * the contract has no override stored.
   *
   * @returns The max post content length in UTF-8 bytes.
   *
   * @example
   * ```ts
   * const max = await client.getMaxPostContentLen();
   * console.log(`Max post length: ${max} bytes`);
   * ```
   */
  async getMaxPostContentLen(): Promise<number> {
    const retval = await this.simulateCallOnContract(this._contractId, "get_max_post_content_len");
    if (!retval) return 280;
    return Number(scValToNative(retval));
  }

  /**
   * Get the number of likes a post has received.
   *
   * @param postId The ID of the post.
   * @returns The like count.
   *
   * @example
   * ```ts
   * const likes = await client.getLikeCount(123n);
   * console.log(`Post has ${likes.toString()} likes`);
   * ```
   */
  async getLikeCount(postId: number | bigint): Promise<bigint> {
    return super.getLikeCount(BigInt(postId));
  }

  /**
   * Execute a read function and wrap the outcome into a discriminated ReadResult<T>.
   * Callers can distinguish valid values, missing/empty data, and transport errors.
   */
  async executeReadResult<T>(fn: () => Promise<T | null>): Promise<ReadResult<T>> {
    try {
      const value = await fn();
      if (value === null) {
        return { ok: true, value: null, absent: true };
      }
      return { ok: true, value };
    } catch (error: unknown) {
      const linkoraErr = error instanceof LinkoraError ? error : mapError(error);
      if (linkoraErr instanceof NotFoundError) {
        return { ok: true, value: null, absent: true };
      }
      return { ok: false, error: linkoraErr };
    }
  }

  /** Fetch a following-list page using an opaque offset cursor. */
  async getFollowingPage(user: string, options: CursorPageOptions = {}): Promise<CursorPage<string>> {
    const { limit, offset } = normalizeCursorPage(options);
    const items = await super.getFollowing(user, offset, limit);
    return makeCursorPage(items, limit, offset);
  }

  /** Fetch a follower-list page using an opaque offset cursor. */
  async getFollowersPage(user: string, options: CursorPageOptions = {}): Promise<CursorPage<string>> {
    const { limit, offset } = normalizeCursorPage(options);
    const items = await super.getFollowers(user, offset, limit);
    return makeCursorPage(items, limit, offset);
  }

  /** Fetch an author's post-ID page using an opaque offset cursor. */
  async getPostsByAuthorPage(
    author: string,
    options: CursorPageOptions = {}
  ): Promise<CursorPage<bigint>> {
    const { limit, offset } = normalizeCursorPage(options);
    const items = await super.getPostsByAuthor(author, offset, limit);
    return makeCursorPage(items, limit, offset);
  }

  /**
   * Batch multiple contract read/simulation operations into a single RPC roundtrip.
   *
   * @param ops Array of contract operations specifying function method and ScVal arguments.
   * @returns Array of ScVal return values (or null for empty results).
   */
  async batchSimulate(
    ops: Array<{ contractId?: string; method: string; args: xdr.ScVal[] }>
  ): Promise<Array<xdr.ScVal | null>> {
    if (ops.length === 0) return [];

    const tempSource = Keypair.random();
    const tempAccount = new Account(tempSource.publicKey(), "0");
    const tempBuilder = new TransactionBuilder(tempAccount, {
      fee: "100",
      networkPassphrase: this._networkPassphrase,
    });

    for (const opDef of ops) {
      const targetContractId = opDef.contractId ?? this._contractId;
      const contract = new Contract(targetContractId);
      tempBuilder.addOperation(contract.call(opDef.method, ...opDef.args));
    }

    const tempTx = tempBuilder.setTimeout(DEFAULT_TIMEOUT).build();
    const simulationResult = await this._rpcServer.simulateTransaction(tempTx);

    if (isSimulationError(simulationResult)) {
      throw mapError(simulationResult.error);
    }

    if (!isSimulationSuccess(simulationResult) || !simulationResult.result) {
      return ops.map(() => null);
    }

    const results = simulationResult.result ?? [];
    return ops.map((_, i) => {
      const entry = (results as unknown as Array<{ retval?: xdr.ScVal }>)[i];
      return entry?.retval ?? null;
    });
  }

  /**
   * Read the contract version or capability marker from the connected contract.
   * Returns the version string if supported by the contract, or "unknown".
   */
  async getContractVersion(): Promise<string> {
    try {
      const retval = await this.simulateCallOnContract(this._contractId, "version");
      if (!retval) return "unknown";
      return (scValToNative(retval) as string) ?? "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Verify that the contract version matches the expected capability version.
   *
   * @param expectedVersion The required contract version.
   * @throws {VersionMismatchError} If the deployed contract version does not match.
   */
  async verifyContractVersion(expectedVersion: string): Promise<boolean> {
    const actualVersion = await this.getContractVersion();
    if (actualVersion !== "unknown" && actualVersion !== expectedVersion) {
      throw new VersionMismatchError(
        `Contract version mismatch: expected "${expectedVersion}", but deployed contract returned "${actualVersion}".`,
        { expected: expectedVersion, actual: actualVersion }
      );
    }
    return true;
  }

  /**
   * Fetch classic Stellar account balances (native XLM and tokens) via Horizon.
   */
  getClassicAccountBalances(address: string): Promise<ClassicBalance[]> {
    return this.classic.getAccountBalances(address);
  }

  /**
   * Fetch non-native asset trustlines for a classic account via Horizon.
   */
  getClassicAccountTrustlines(address: string): Promise<ClassicBalance[]> {
    return this.classic.getAccountTrustlines(address);
  }

  /**
   * Get the current treasury address where protocol fees are sent.
   *
   * @returns The treasury Stellar public key, or null if not set.
   */
  async getTreasury(): Promise<string | null> {
    try {
      return await super.getTreasury();
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  /**
   * Check whether the contract is currently paused. While paused, all state-mutating
   * calls (follow, post, tip, etc.) will fail simulation.
   *
   * @returns True if the contract is paused, false otherwise.
   *
   * @example
   * ```ts
   * if (await client.isPaused()) {
   *   console.warn("Linkora is temporarily paused.");
   * }
   * ```
   */
  async isPaused(): Promise<boolean> {
    const retval = await this.simulateCallOnContract(this._contractId, "is_paused");
    if (!retval) return false;
    return Boolean(scValToNative(retval));
  }

  /**
   * Fetch a multi-sig pool by its unique ID.
   *
   * @param poolId The unique identifier of the pool.
   * @returns The Pool object, or null if not found.
   *
   * @example
   * ```ts
   * const pool = await client.getPool("my-community-pool");
   * if (pool) {
   *   console.log(`Pool balance: ${pool.balance.toString()}`);
   * }
   * ```
   */
  async getPool(poolId: string): Promise<Pool | null> {
    try {
      return await super.getPool(poolId);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  // ── DM key methods ───────────────────────────────────────────────────────

  /**
   * Get the X25519 public key published by a user for encrypted direct messages.
   *
   * @param address The Stellar public key of the user.
   * @returns The 32-byte X25519 public key, or null if not set.
   *
   * @example
   * ```ts
   * const dmKey = await client.getDmKey("GBFOY...");
   * if (dmKey) {
   *   console.log("Found DM key, ready to encrypt messages.");
   * } else {
   *   console.log("User has not published a DM key.");
   * }
   * ```
   */
  async getDmKey(address: string): Promise<Uint8Array | null> {
    try {
      return await super.getDmKey(address);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  /**
   * Publish a user's X25519 public key for encrypted direct messages.
   *
   * @param user The Stellar public key of the user.
   * @param x25519PubKey The 32-byte X25519 public key.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @throws {ValidationError} If the public key is not exactly 32 bytes.
   *
   * @example
   * ```ts
   * import { box } from "tweetnacl";
   *
   * const keypair = box.keyPair();
   * const txOp = client.publishDmKey("GBFOY...", keypair.publicKey);
   * console.log("Operation XDR:", txOp);
   * ```
   */
  publishDmKey(user: string, x25519PubKey: Uint8Array): string {
    if (x25519PubKey.length !== 32) {
      throw new ValidationError("X25519 public key must be exactly 32 bytes", {
        actual: x25519PubKey.length,
        expected: 32,
      });
    }
    return super.publishDmKey(user, x25519PubKey);
  }

  /**
   * Build a publish_dm_key transaction with the caller as the proper source
   * account so it can be signed directly by a browser wallet (e.g. Freighter).
   *
   * Unlike publishDmKey(), which uses a random placeholder account, this method:
   *  1. Fetches the real account sequence from Horizon.
   *  2. Simulates the transaction to obtain accurate resource fees.
   *  3. Returns a base64-encoded XDR ready for wallet signing and RPC submission.
   *
   * @param userAddress The Stellar public key of the user.
   * @param x25519PubKey The 32-byte X25519 public key.
   * @param horizonUrl Optional Horizon URL to use. If not provided, it defaults based on the network passphrase.
   *
   * @returns The base64-encoded transaction envelope XDR.
   *
   * @throws {ValidationError} If the public key is not exactly 32 bytes.
   * @throws {NetworkError} If fetching the account sequence from Horizon fails.
   *
   * @see {@link https://developers.stellar.org/api/horizon Stellar Horizon API}
   *
   * @example
   * ```ts
   * import { box } from "tweetnacl";
   *
   * try {
   *   const keypair = box.keyPair();
   *   const txXdr = await client.prepareDmKeyTx(
   *     "GBFOY...",
   *     keypair.publicKey
   *   );
   *   console.log("Ready to sign:", txXdr);
   * } catch (error) {
   *   console.error("Failed to prepare DM key tx:", error.message);
   * }
   * ```
   */
  async prepareDmKeyTx(
    userAddress: string,
    x25519PubKey: Uint8Array,
    horizonUrl?: string
  ): Promise<string> {
    if (x25519PubKey.length !== 32) {
      throw new ValidationError("X25519 public key must be exactly 32 bytes", {
        actual: x25519PubKey.length,
        expected: 32,
      });
    }

    const sourceAccount = await this.getAccountForTx(userAddress, horizonUrl);
    const tx = await this.prepareTransaction(
      "publish_dm_key",
      sourceAccount,
      nativeToScVal(userAddress, { type: "address" }),
      nativeToScVal(Array.from(x25519PubKey), { type: "bytes" })
    );

    return tx.toEnvelope().toXDR("base64");
  }

  /**
   * Helper to fetch the latest sequence number from Horizon and return a Stellar Account.
   */
  private async getAccountForTx(userAddress: string, horizonUrl?: string): Promise<Account> {
    const effectiveHorizonUrl = horizonUrl ?? this._horizonUrl ?? this.getDefaultHorizonUrl();
    const res = await fetchWithTimeout(
      `${effectiveHorizonUrl}/accounts/${userAddress}`,
      undefined,
      this._timeoutMs
    );
    if (!res.ok) {
      throw new NetworkError(
        `Could not fetch account from Horizon (HTTP ${res.status}). ` +
          `Make sure the wallet is funded on the correct network.`
      );
    }
    const data = (await res.json()) as { sequence: string };
    return new Account(userAddress, data.sequence);
  }

  private getDefaultHorizonUrl(): string {
    if (this._networkPassphrase.includes("Test")) {
      return "https://horizon-testnet.stellar.org";
    }
    if (this._networkPassphrase === "Public Global Stellar Network ; September 2015") {
      return "https://horizon.stellar.org";
    }
    throw new ValidationError(
      `Cannot determine Horizon URL for custom network passphrase: "${this._networkPassphrase}". ` +
        `Please provide horizonUrl in ClientConfig.`,
      { networkPassphrase: this._networkPassphrase }
    );
  }

  // ── Governance convenience overrides ──────────────────────────────────────

  /** Fetch an indexed governance proposal. Unknown IDs return null. */
  async getProposal(proposalId: number | bigint | string): Promise<GovProposal | null> {
    const id = normalizePositiveId(proposalId, "proposalId");
    const response = await fetchWithTimeout(
      `${this._indexerUrl}/governance/proposals/${id}`,
      undefined,
      this._timeoutMs
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new NetworkError(`Indexer returned HTTP ${response.status} for governance proposal.`, {
        status: response.status,
        proposalId: id,
      });
    }
    const body = (await response.json()) as { proposal?: Record<string, unknown> } & Record<string, unknown>;
    return normalizeIndexerProposal(body.proposal ?? body);
  }

  /** List indexed proposals with optional status filtering and cursor pagination. */
  async listProposals(options: GovernanceProposalListOptions = {}): Promise<GovernanceProposalList> {
    const { status, cursor, limit = 20 } = options;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError("limit must be an integer between 1 and 100.");
    }
    if (cursor !== undefined && !/^\d+$/.test(cursor)) {
      throw new ValidationError("cursor must be a non-negative numeric offset.");
    }
    const query = new URLSearchParams({ limit: String(limit) });
    if (status) query.set("status", status);
    if (cursor) query.set("cursor", cursor);
    const response = await fetchWithTimeout(
      `${this._indexerUrl}/governance/proposals?${query.toString()}`,
      undefined,
      this._timeoutMs
    );
    if (!response.ok) {
      throw new NetworkError(`Indexer returned HTTP ${response.status} while listing proposals.`, {
        status: response.status,
      });
    }
    const body = (await response.json()) as {
      proposals?: Record<string, unknown>[];
      nextCursor?: string | null;
      next_cursor?: string | null;
    };
    return {
      proposals: (body.proposals ?? []).map(normalizeIndexerProposal),
      nextCursor: body.nextCursor ?? body.next_cursor ?? null,
    };
  }

  /** Fetch voting power from the indexer for a wallet address. */
  async getVotingPower(address: string): Promise<bigint> {
    ensureAddress(address, "address");
    const response = await fetchWithTimeout(
      `${this._indexerUrl}/governance/voting-power/${encodeURIComponent(address)}`,
      undefined,
      this._timeoutMs
    );
    if (!response.ok) {
      throw new NetworkError(`Indexer returned HTTP ${response.status} for voting power.`, {
        status: response.status,
        address,
      });
    }
    const body = (await response.json()) as { votingPower?: string | number | bigint; voting_power?: string | number | bigint };
    const value = body.votingPower ?? body.voting_power ?? 0;
    try {
      return BigInt(value);
    } catch (cause) {
      throw new LinkoraError("Indexer returned invalid voting power.", "INVALID_RESPONSE", { address }, cause);
    }
  }

  /** Submit a governance proposal through the SDK transaction queue. */
  async createProposal(
    proposer: string,
    parameter: GovParameter,
    newValue: number | bigint,
    newAddress: string | null,
    signer: QueueSigner,
    horizonUrl?: string,
    opts?: RunOptions
  ): Promise<{ proposalId: bigint }> {
    ensureAddress(proposer, "proposer");
    ensureGovParameter(parameter);
    ensureInteger(newValue, "newValue");
    if (newAddress !== null) ensureAddress(newAddress, "newAddress");
    const source = await this.getAccountForTx(proposer, horizonUrl);
    const tx = await this.prepareTransaction(
      "gov_propose",
      source,
      scvAddress(proposer),
      nativeToScVal(parameter),
      scvU64(newValue),
      nativeToScVal(newAddress)
    );
    const hash = await this.submitTransaction(tx, signer, opts);
    const response = await this._rpcServer.getTransaction(hash);
    const returnValue = (response as unknown as { returnValue?: xdr.ScVal }).returnValue;
    if (!returnValue) {
      throw new LinkoraError("Confirmed proposal transaction did not include its proposal ID.", "INVALID_RESPONSE", { hash });
    }
    const value = scValToNative(returnValue);
    try {
      return { proposalId: BigInt(value as string | number | bigint) };
    } catch (cause) {
      throw new LinkoraError("Proposal transaction returned an invalid proposal ID.", "INVALID_RESPONSE", { hash }, cause);
    }
  }

  /** Submit a vote (`true`/`for` or `false`/`against`) through the transaction queue. */
  async vote(
    voter: string,
    proposalId: number | bigint,
    choice: boolean | "for" | "against",
    signer: QueueSigner,
    horizonUrl?: string,
    opts?: RunOptions
  ): Promise<{ txHash: string }> {
    ensureAddress(voter, "voter");
    const id = ensurePositiveInteger(proposalId, "proposalId");
    const support = typeof choice === "boolean" ? choice : choice === "for";
    const source = await this.getAccountForTx(voter, horizonUrl);
    const tx = await this.prepareTransaction(
      "gov_vote",
      source,
      scvAddress(voter),
      scvU64(id),
      nativeToScVal(support)
    );
    return { txHash: await this.submitTransaction(tx, signer, opts) };
  }

  /** Build, validate, and queue a pool withdrawal against its on-chain M-of-N policy. */
  async withdraw(
    signers: string[],
    poolId: string,
    amount: number | bigint,
    recipient: string,
    signer: QueueSigner,
    horizonUrl?: string,
    opts?: RunOptions
  ): Promise<{ txHash: string }> {
    ensureAddressList(signers, "signers");
    ensureNonEmptyString(poolId, "poolId");
    const withdrawalAmount = ensurePositiveInteger(amount, "amount");
    ensureAddress(recipient, "recipient");
    if (new Set(signers).size !== signers.length) {
      throw new ValidationError("Withdrawal signers must be unique.", { poolId });
    }
    const pool = await this.getPool(poolId);
    if (!pool) throw new NotFoundError(`Pool ${poolId} was not found.`, { poolId });
    const admins = await this.getPoolAdmins(poolId);
    if (!admins) throw new NotFoundError(`Pool ${poolId} was not found.`, { poolId });
    const unauthorized = signers.filter((address) => !admins.includes(address));
    if (unauthorized.length) {
      throw new UnauthorizedError("Every withdrawal signer must be a pool admin.", {
        poolId,
        unauthorizedSigners: unauthorized,
      });
    }
    if (signers.length < pool.threshold) {
      throw new ValidationError(
        `Pool withdrawal requires ${pool.threshold} admin signatures; received ${signers.length}.`,
        { poolId, requiredThreshold: pool.threshold, providedSigners: signers.length }
      );
    }
    if (pool.balance < withdrawalAmount) {
      throw new InsufficientBalanceError("Pool balance is insufficient for this withdrawal.", {
        poolId,
        available: pool.balance.toString(),
        required: withdrawalAmount.toString(),
      });
    }
    const xdrString = await this.preparePoolWithdrawTx(signers, poolId, amount, recipient, horizonUrl);
    try {
      return { txHash: await this.submitTransaction(xdrString, signer, opts) };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/insufficient signers|threshold/i.test(message)) {
        throw new LinkoraError(
          `Pool withdrawal failed to meet its ${pool.threshold}-of-${admins.length} admin threshold.`,
          "POOL_THRESHOLD_NOT_MET",
          { poolId, requiredThreshold: pool.threshold, providedSigners: signers.length },
          cause
        );
      }
      throw cause;
    }
  }

  /**
   * Propose a change to a governance parameter.
   *
   * @param proposer The Stellar public key of the proposer.
   * @param parameter The parameter to change.
   * @param newValue The proposed new integer value.
   * @param newAddress The proposed new address, if applicable (e.g., for Treasury).
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @throws {ValidationError} If inputs are malformed.
   *
   * @example
   * ```ts
   * import { GovParameter } from "./generated/types";
   *
   * const txOp = client.govPropose(
   *   "GBFOY...",
   *   "FeeBps",
   *   500,
   *   null
   * );
   * console.log("Propose Op XDR:", txOp);
   * ```
   */
  govPropose(
    proposer: string,
    parameter: GovParameter,
    newValue: number | bigint,
    newAddress: string | null
  ): string {
    ensureAddress(proposer, "proposer");
    ensureGovParameter(parameter);
    ensureInteger(newValue, "newValue");
    if (newAddress !== null) {
      ensureAddress(newAddress, "newAddress");
    }
    return super.govPropose(proposer, parameter, BigInt(newValue), newAddress);
  }

  /**
   * Vote on an active governance proposal.
   *
   * @param voter The Stellar public key of the voter.
   * @param proposalId The ID of the proposal.
   * @param support True to support, false to reject.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.govVote("GBFOY...", 12n, true);
   * console.log("Vote Op XDR:", txOp);
   * ```
   */
  govVote(voter: string, proposalId: number | bigint, support: boolean): string {
    ensureAddress(voter, "voter");
    ensurePositiveInteger(proposalId, "proposalId");
    return super.govVote(voter, BigInt(proposalId), support);
  }

  /**
   * Execute a successful governance proposal.
   *
   * @param proposalId The ID of the proposal to execute.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.govExecute(12n);
   * console.log("Execute Op XDR:", txOp);
   * ```
   */
  govExecute(proposalId: number | bigint): string {
    ensurePositiveInteger(proposalId, "proposalId");
    return super.govExecute(BigInt(proposalId));
  }

  /**
   * Fetch a governance proposal by ID.
   *
   * @param proposalId The ID of the proposal.
   * @returns The GovProposal object.
   *
   * @example
   * ```ts
   * const proposal = await client.govGetProposal(12n);
   * console.log("Proposal parameter:", proposal.parameter);
   * ```
   */
  govGetProposal(proposalId: number | bigint): Promise<GovProposal> {
    ensurePositiveInteger(proposalId, "proposalId");
    return super.govGetProposal(BigInt(proposalId));
  }

  /**
   * Get the effective quorum required for a proposal.
   *
   * @param proposalId The ID of the proposal.
   * @returns The number of votes required for quorum.
   *
   * @example
   * ```ts
   * const quorum = await client.effectiveQuorum(12n);
   * console.log("Required quorum:", quorum);
   * ```
   */
  effectiveQuorum(proposalId: number | bigint): Promise<number> {
    ensurePositiveInteger(proposalId, "proposalId");
    return super.effectiveQuorum(BigInt(proposalId));
  }

  /**
   * Veto a governance proposal (requires pool admin authorization).
   *
   * @param signers Array of Stellar public keys of the pool admins signing.
   * @param poolId The ID of the pool whose admins are vetoing.
   * @param proposalId The ID of the proposal to veto.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.govVeto(
   *   ["GBFOY...", "GCO23..."],
   *   "moderation-pool",
   *   12n
   * );
   * console.log("Veto Op XDR:", txOp);
   * ```
   */
  govVeto(signers: string[], poolId: string, proposalId: number | bigint): string {
    ensureAddressList(signers, "signers");
    ensureNonEmptyString(poolId, "poolId");
    ensurePositiveInteger(proposalId, "proposalId");
    return super.govVeto(signers, poolId, BigInt(proposalId));
  }

  // ── Override write methods with number→bigint conversions ─────────────────

  /**
   * Set or update a user's profile and link it to their creator token.
   *
   * @param user The Stellar public key of the user.
   * @param username The desired username.
   * @param creatorToken The contract ID of the user's creator token.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.setProfile("GBFOY...", "alice", "CABC123...");
   * console.log("Set Profile Op XDR:", txOp);
   * ```
   */
  setProfile(user: string, username: string, creatorToken: string): string {
    ensureAddress(user, "user");
    ensureNonEmptyString(username, "username");
    ensureAddress(creatorToken, "creatorToken");
    return super.setProfile(user, username, creatorToken);
  }

  /** Build, simulate, and submit a set_profile transaction through the transaction queue. */
  async submitSetProfile(
    user: string,
    username: string,
    creatorToken: string,
    signer: QueueSigner,
    horizonUrl?: string,
    opts?: RunOptions,
  ): Promise<string> {
    ensureAddress(user, "user");
    ensureNonEmptyString(username, "username");
    ensureAddress(creatorToken, "creatorToken");
    const sourceAccount = await this.getAccountForTx(user, horizonUrl);
    const tx = await this.prepareTransaction(
      "set_profile",
      sourceAccount,
      scvAddress(user),
      scvString(username),
      scvAddress(creatorToken),
    );
    return this.submitTransaction(tx, signer, opts);
  }

  /**
   * Delete a user's profile.
   *
   * @param user The Stellar public key of the user.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.deleteProfile("GBFOY...");
   * console.log("Delete Profile Op XDR:", txOp);
   * ```
   */
  deleteProfile(user: string): string {
    ensureAddress(user, "user");
    return super.deleteProfile(user);
  }

  /**
   * Create a new post.
   *
   * @param author The Stellar public key of the author.
   * @param content The text content of the post.
   * @returns A base64-encoded transaction XDR built with a throwaway keypair (not directly submittable).
   *
   * @example
   * ```ts
   * const txOp = client.createPost("GBFOY...", "Hello, Soroban!");
   * console.log("Create Post Op XDR:", txOp);
   * ```
   */
  createPost(author: string, content: string): string {
    ensureAddress(author, "author");
    validatePostContent(content);
    return super.createPost(author, content);
  }

  /**
   * Build a submittable create_post transaction with the caller as the proper source account.
   *
   * @param author The Stellar public key of the author.
   * @param content The text content of the post.
   * @param horizonUrl Optional Horizon URL to use. Defaults based on the network passphrase.
   * @returns The base64-encoded transaction envelope XDR ready for wallet signing.
   */
  async prepareCreatePostTx(author: string, content: string, horizonUrl?: string): Promise<string> {
    ensureAddress(author, "author");
    validatePostContent(content);
    const sourceAccount = await this.getAccountForTx(author, horizonUrl);
    const tx = await this.prepareTransaction(
      "create_post",
      sourceAccount,
      scvAddress(author),
      scvString(content)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /** Submit a post and return its contract-assigned post ID after confirmation. */
  async createPostAndSubmit(
    author: string,
    content: string,
    signer: QueueSigner,
    horizonUrl?: string,
    opts?: RunOptions,
  ): Promise<{ postId: bigint }> {
    const transactionXdr = await this.prepareCreatePostTx(author, content, horizonUrl);
    const hash = await this.submitTransaction(transactionXdr, signer, opts);
    const result = await this._rpcServer.getTransaction(hash);
    if (!("returnValue" in result) || !result.returnValue) {
      throw new Error("Confirmed create_post transaction did not include a return value.");
    }
    const value = scValToNative(result.returnValue);
    if (typeof value !== "bigint" && typeof value !== "number") {
      throw new Error("create_post returned an invalid post ID.");
    }
    return { postId: BigInt(value) };
  }

  /** Build and simulate set_profile, returning an unsigned envelope for wallet signing. */
  async prepareSetProfileTx(
    user: string,
    username: string,
    creatorToken: string,
    horizonUrl?: string,
  ): Promise<string> {
    ensureAddress(user, "user");
    ensureNonEmptyString(username, "username");
    ensureAddress(creatorToken, "creatorToken");
    const sourceAccount = await this.getAccountForTx(user, horizonUrl);
    const tx = await this.prepareTransaction(
      "set_profile",
      sourceAccount,
      scvAddress(user),
      scvString(username),
      scvAddress(creatorToken),
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /**
   * Delete an existing post.
   *
   * @param author The Stellar public key of the author.
   * @param postId The ID of the post to delete.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.deletePost("GBFOY...", 123n);
   * console.log("Delete Post Op XDR:", txOp);
   * ```
   */
  deletePost(author: string, postId: number | bigint): string {
    ensureAddress(author, "author");
    ensurePositiveInteger(postId, "postId");
    return super.deletePost(author, BigInt(postId));
  }

  /**
   * Follow another user.
   *
   * @param follower The Stellar public key of the follower.
   * @param followee The Stellar public key of the user to follow.
   * @returns A base64-encoded transaction XDR built with a throwaway keypair (not directly submittable).
   *
   * @example
   * ```ts
   * const txOp = client.follow("GBFOY...", "GCO23...");
   * console.log("Follow Op XDR:", txOp);
   * ```
   */
  follow(follower: string, followee: string): string {
    ensureAddress(follower, "follower");
    ensureAddress(followee, "followee");
    return super.follow(follower, followee);
  }

  /**
   * Build a submittable follow transaction with the caller as the proper source account.
   *
   * @param follower The Stellar public key of the follower.
   * @param followee The Stellar public key of the user to follow.
   * @param horizonUrl Optional Horizon URL to use. Defaults based on the network passphrase.
   * @returns The base64-encoded transaction envelope XDR ready for wallet signing.
   */
  async prepareFollowTx(follower: string, followee: string, horizonUrl?: string): Promise<string> {
    ensureAddress(follower, "follower");
    ensureAddress(followee, "followee");
    const sourceAccount = await this.getAccountForTx(follower, horizonUrl);
    const tx = await this.prepareTransaction(
      "follow",
      sourceAccount,
      scvAddress(follower),
      scvAddress(followee)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /** Build and submit a follow through the transaction queue. The contract makes repeats idempotent. */
  async submitFollow(
    follower: string,
    followee: string,
    signer: QueueSigner,
    opts?: RunOptions,
    horizonUrl?: string
  ): Promise<string> {
    const tx = await this.prepareFollowTx(follower, followee, horizonUrl);
    return this.submitTransaction(tx, signer, opts);
  }

  /**
   * Unfollow a user.
   *
   * @param follower The Stellar public key of the follower.
   * @param followee The Stellar public key of the user to unfollow.
   * @returns A base64-encoded transaction XDR built with a throwaway keypair (not directly submittable).
   *
   * @example
   * ```ts
   * const txOp = client.unfollow("GBFOY...", "GCO23...");
   * console.log("Unfollow Op XDR:", txOp);
   * ```
   */
  unfollow(follower: string, followee: string): string {
    ensureAddress(follower, "follower");
    ensureAddress(followee, "followee");
    return super.unfollow(follower, followee);
  }

  /**
   * Build a submittable unfollow transaction with the caller as the proper source account.
   *
   * @param follower The Stellar public key of the follower.
   * @param followee The Stellar public key of the user to unfollow.
   * @param horizonUrl Optional Horizon URL to use. Defaults based on the network passphrase.
   * @returns The base64-encoded transaction envelope XDR ready for wallet signing.
   */
  async prepareUnfollowTx(
    follower: string,
    followee: string,
    horizonUrl?: string
  ): Promise<string> {
    ensureAddress(follower, "follower");
    ensureAddress(followee, "followee");
    const sourceAccount = await this.getAccountForTx(follower, horizonUrl);
    const tx = await this.prepareTransaction(
      "unfollow",
      sourceAccount,
      scvAddress(follower),
      scvAddress(followee)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /** Build and submit an unfollow through the transaction queue. Repeats are safe no-ops on-chain. */
  async submitUnfollow(
    follower: string,
    followee: string,
    signer: QueueSigner,
    opts?: RunOptions,
    horizonUrl?: string
  ): Promise<string> {
    const tx = await this.prepareUnfollowTx(follower, followee, horizonUrl);
    return this.submitTransaction(tx, signer, opts);
  }

  /** Build and submit a block operation through the transaction queue. */
  async submitBlock(
    blocker: string,
    blocked: string,
    signer: QueueSigner,
    opts?: RunOptions,
    horizonUrl?: string
  ): Promise<string> {
    const tx = await this.prepareBlockTx(blocker, blocked, horizonUrl);
    return this.submitTransaction(tx, signer, opts);
  }

  /** Build a submittable block_user transaction with the blocker as source account. */
  async prepareBlockTx(blocker: string, blocked: string, horizonUrl?: string): Promise<string> {
    ensureAddress(blocker, "blocker");
    ensureAddress(blocked, "blocked");
    const sourceAccount = await this.getAccountForTx(blocker, horizonUrl);
    const tx = await this.prepareTransaction(
      "block_user",
      sourceAccount,
      scvAddress(blocker),
      scvAddress(blocked)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /** Build and submit an unblock operation through the transaction queue. */
  async submitUnblock(
    blocker: string,
    blocked: string,
    signer: QueueSigner,
    opts?: RunOptions,
    horizonUrl?: string
  ): Promise<string> {
    const tx = await this.prepareUnblockTx(blocker, blocked, horizonUrl);
    return this.submitTransaction(tx, signer, opts);
  }

  /** Build a submittable unblock_user transaction with the blocker as source account. */
  async prepareUnblockTx(blocker: string, blocked: string, horizonUrl?: string): Promise<string> {
    ensureAddress(blocker, "blocker");
    ensureAddress(blocked, "blocked");
    const sourceAccount = await this.getAccountForTx(blocker, horizonUrl);
    const tx = await this.prepareTransaction(
      "unblock_user",
      sourceAccount,
      scvAddress(blocker),
      scvAddress(blocked)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /**
   * Block a user.
   *
   * @param blocker The Stellar public key of the user initiating the block.
   * @param blocked The Stellar public key of the user to block.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.blockUser("GBFOY...", "GCO23...");
   * console.log("Block Op XDR:", txOp);
   * ```
   */
  blockUser(blocker: string, blocked: string): string {
    ensureAddress(blocker, "blocker");
    ensureAddress(blocked, "blocked");
    return super.blockUser(blocker, blocked);
  }

  /**
   * Unblock a previously blocked user.
   *
   * @param blocker The Stellar public key of the user who initiated the block.
   * @param blocked The Stellar public key of the blocked user.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.unblockUser("GBFOY...", "GCO23...");
   * console.log("Unblock Op XDR:", txOp);
   * ```
   */
  unblockUser(blocker: string, blocked: string): string {
    ensureAddress(blocker, "blocker");
    ensureAddress(blocked, "blocked");
    return super.unblockUser(blocker, blocked);
  }

  /**
   * Like a post.
   *
   * @param user The Stellar public key of the user liking the post.
   * @param postId The ID of the post.
   * @returns A base64-encoded transaction XDR built with a throwaway keypair (not directly submittable).
   *
   * @example
   * ```ts
   * const txOp = client.likePost("GBFOY...", 123n);
   * console.log("Like Op XDR:", txOp);
   * ```
   */
  likePost(user: string, postId: number | bigint): string {
    ensureAddress(user, "user");
    ensurePositiveInteger(postId, "postId");
    return super.likePost(user, BigInt(postId));
  }

  /**
   * Build a submittable like_post transaction with the caller as the proper source account.
   *
   * @param user The Stellar public key of the user liking the post.
   * @param postId The ID of the post.
   * @param horizonUrl Optional Horizon URL to use. Defaults based on the network passphrase.
   * @returns The base64-encoded transaction envelope XDR ready for wallet signing.
   */
  async prepareLikePostTx(
    user: string,
    postId: number | bigint,
    horizonUrl?: string
  ): Promise<string> {
    ensureAddress(user, "user");
    ensurePositiveInteger(postId, "postId");
    const sourceAccount = await this.getAccountForTx(user, horizonUrl);
    const tx = await this.prepareTransaction(
      "like_post",
      sourceAccount,
      scvAddress(user),
      scvU64(postId)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /** List tips made to one post, newest first, using numeric offset cursors. */
  async getTipsByPost(
    postId: number | bigint,
    options: TipHistoryOptions = {}
  ): Promise<TipHistoryPage> {
    const id = ensurePositiveInteger(postId, "postId");
    return this.listTipRecords(`/tips/by-post/${id}`, options);
  }

  /** List tips received by a wallet across all of its posts. */
  async getTipsReceived(
    address: string,
    options: TipHistoryOptions = {}
  ): Promise<TipHistoryPage> {
    ensureAddress(address, "address");
    return this.listTipRecords(`/tips/received/${encodeURIComponent(address)}`, options);
  }

  /** List tips sent by a wallet. */
  async getTipsSent(
    address: string,
    options: TipHistoryOptions = {}
  ): Promise<TipHistoryPage> {
    ensureAddress(address, "address");
    return this.listTipRecords(`/tips/sent/${encodeURIComponent(address)}`, options);
  }

  /** Aggregate sent and received tips over the half-open `[from, to)` interval. */
  async getTipTotals(
    address: string,
    from?: Date | string,
    to?: Date | string
  ): Promise<TipTotals> {
    ensureAddress(address, "address");
    const start = normalizeDate(from, "from");
    const end = normalizeDate(to, "to");
    if (start && end && start >= end) {
      throw new ValidationError("from must be earlier than to.");
    }
    const query = new URLSearchParams();
    if (start) query.set("from", start.toISOString());
    if (end) query.set("to", end.toISOString());
    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    const response = await fetchWithTimeout(
      `${this._indexerUrl}/tips/totals/${encodeURIComponent(address)}${suffix}`,
      undefined,
      this._timeoutMs
    );
    if (!response.ok) {
      throw new NetworkError(`Indexer returned HTTP ${response.status} for tip totals.`, {
        status: response.status,
        address,
      });
    }
    const body = (await response.json()) as Record<string, unknown>;
    return {
      sentCount: Number(body.sent_count ?? 0),
      sentAmount: BigInt((body.sent_amount ?? 0) as string | number | bigint),
      sentFee: BigInt((body.sent_fee ?? 0) as string | number | bigint),
      receivedCount: Number(body.received_count ?? 0),
      receivedAmount: BigInt((body.received_amount ?? 0) as string | number | bigint),
      receivedFee: BigInt((body.received_fee ?? 0) as string | number | bigint),
    };
  }

  private async listTipRecords(path: string, options: TipHistoryOptions): Promise<TipHistoryPage> {
    const { limit = 20, cursor = "0" } = options;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError("limit must be an integer between 1 and 100.");
    }
    if (!/^\d+$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) {
      throw new ValidationError("cursor must be a non-negative numeric offset.");
    }
    const query = new URLSearchParams({ limit: String(limit), cursor });
    const response = await fetchWithTimeout(
      `${this._indexerUrl}${path}?${query.toString()}`,
      undefined,
      this._timeoutMs
    );
    if (!response.ok) {
      throw new NetworkError(`Indexer returned HTTP ${response.status} for tip history.`, {
        status: response.status,
        path,
      });
    }
    const body = (await response.json()) as {
      tips?: Array<Record<string, unknown>>;
      total?: number;
      next_cursor?: string | null;
      nextCursor?: string | null;
    };
    return {
      tips: (body.tips ?? []).map(normalizeTipRecord),
      total: Number(body.total ?? 0),
      nextCursor: body.nextCursor ?? body.next_cursor ?? null,
    };
  }

  /**
   * Tip the author of a post.
   *
   * @param tipper The Stellar public key of the user sending the tip.
   * @param postId The ID of the post whose author will receive the tip.
   * @param token The contract ID of the token used for the tip.
   * @param amount The tip amount in stroops (or smallest decimal unit).
   * @returns A base64-encoded transaction XDR built with a throwaway keypair (not directly submittable).
   *
   * @example
   * ```ts
   * const txOp = client.tip("GBFOY...", 123n, "CABC123...", 50000000n);
   * console.log("Tip Op XDR:", txOp);
   * ```
   */
  tip(tipper: string, postId: number | bigint, token: string, amount: number | bigint): string {
    ensureAddress(tipper, "tipper");
    ensurePositiveInteger(postId, "postId");
    ensureAddress(token, "token");
    ensurePositiveInteger(amount, "amount");
    return super.tip(tipper, BigInt(postId), token, BigInt(amount));
  }

  /**
   * Build a submittable tip transaction with the caller as the proper source account.
   *
   * @param tipper The Stellar public key of the user sending the tip.
   * @param postId The ID of the post whose author will receive the tip.
   * @param token The contract ID of the token used for the tip.
   * @param amount The tip amount in stroops.
   * @param horizonUrl Optional Horizon URL to use. Defaults based on the network passphrase.
   * @returns The base64-encoded transaction envelope XDR ready for wallet signing.
   */
  async prepareTipTx(
    tipper: string,
    postId: number | bigint,
    token: string,
    amount: number | bigint,
    horizonUrl?: string
  ): Promise<string> {
    ensureAddress(tipper, "tipper");
    ensurePositiveInteger(postId, "postId");
    ensureAddress(token, "token");
    ensurePositiveInteger(amount, "amount");
    const sourceAccount = await this.getAccountForTx(tipper, horizonUrl);
    const tx = await this.prepareTransaction(
      "tip",
      sourceAccount,
      scvAddress(tipper),
      scvU64(postId),
      scvAddress(token),
      scvI128(amount)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /** Check the token balance, prepare the contract's fee-split tip call, and submit it via the queue. */
  async sendTip(
    tipper: string,
    postId: number | bigint,
    token: string,
    amount: number | bigint,
    signer: QueueSigner,
    horizonUrl?: string,
    opts?: RunOptions
  ): Promise<{ txHash: string }> {
    ensureAddress(tipper, "tipper");
    ensurePositiveInteger(postId, "postId");
    ensureAddress(token, "token");
    const amountBigInt = ensurePositiveInteger(amount, "amount");

    const feeBps = await this.getFeeBps();
    if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
      throw new LinkoraError("Contract returned an invalid platform fee rate.", "INVALID_RESPONSE", {
        feeBps,
      });
    }
    // Keep the contract's floor-rounded fee calculation explicit for validation
    // and parity: the contract transfers this share to treasury and the balance
    // check covers the full gross amount supplied to `tip`.
    const feeAmount = (amountBigInt * BigInt(feeBps)) / 10_000n;
    const authorAmount = amountBigInt - feeAmount;
    if (feeAmount < 0n || authorAmount < 0n) {
      throw new LinkoraError("Contract returned an invalid platform fee split.", "INVALID_RESPONSE");
    }

    const balance = await this.getSep41Balance(tipper, token, horizonUrl);
    if (balance < amountBigInt) {
      throw new InsufficientBalanceError("Insufficient token balance to send this tip.", {
        tipper,
        token,
        available: balance.toString(),
        required: amountBigInt.toString(),
      });
    }

    const xdrString = await this.prepareTipTx(tipper, postId, token, amountBigInt, horizonUrl);
    return { txHash: await this.submitTransaction(xdrString, signer, opts) };
  }

  private async getSep41Balance(
    owner: string,
    token: string,
    horizonUrl?: string
  ): Promise<bigint> {
    const source = await this.getAccountForTx(owner, horizonUrl);
    const transaction = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: this._networkPassphrase,
    })
      .addOperation(new Contract(token).call("balance", scvAddress(owner)))
      .setTimeout(DEFAULT_TIMEOUT)
      .build();
    const simulation = await this._rpcServer.simulateTransaction(transaction);
    if (isSimulationError(simulation)) {
      throw mapError(simulation.error);
    }
    if (!isSimulationSuccess(simulation) || !simulation.result?.retval) {
      throw new SimulationError("Unable to read token balance from simulation.", undefined, simulation);
    }
    const raw = scValToNative(simulation.result.retval);
    try {
      return BigInt(raw as string | number | bigint);
    } catch (cause) {
      throw new LinkoraError("Token contract returned an invalid balance.", "INVALID_RESPONSE", {
        token,
        owner,
      }, cause);
    }
  }

  /**
   * Create a new multi-sig pool.
   *
   * @param admin The Stellar public key of the pool creator/initial admin.
   * @param poolId The unique identifier for the pool.
   * @param token The contract ID of the token used in this pool.
   * @param initialAdmins Array of Stellar public keys of the initial admins.
   * @param threshold The required signature threshold for pool actions.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.createPool(
   *   "GBFOY...",
   *   "my-pool-1",
   *   "CABC123...",
   *   ["GBFOY...", "GCO23..."],
   *   2
   * );
   * console.log("Create Pool Op XDR:", txOp);
   * ```
   */
  createPool(
    admin: string,
    poolId: string,
    token: string,
    initialAdmins: string[],
    threshold: number | bigint
  ): string {
    ensureAddress(admin, "admin");
    ensureNonEmptyString(poolId, "poolId");
    ensureAddress(token, "token");
    ensureAddressList(initialAdmins, "initialAdmins");
    ensureInteger(threshold, "threshold", 1);
    return super.createPool(admin, poolId, token, initialAdmins, Number(threshold));
  }

  /**
   * Build a submittable create_pool transaction with the caller as the proper
   * source account.
   *
   * @param admin The Stellar public key of the pool creator/initial admin.
   * @param poolId The unique identifier for the pool.
   * @param token The contract ID of the token used in this pool.
   * @param initialAdmins Array of Stellar public keys of the initial admins.
   * @param threshold The required signature threshold for pool actions.
   * @param horizonUrl Optional Horizon URL to use. Defaults based on the network passphrase.
   * @returns The base64-encoded transaction envelope XDR ready for wallet signing.
   */
  async prepareCreatePoolTx(
    admin: string,
    poolId: string,
    token: string,
    initialAdmins: string[],
    threshold: number | bigint,
    horizonUrl?: string
  ): Promise<string> {
    ensureAddress(admin, "admin");
    ensureNonEmptyString(poolId, "poolId");
    ensureAddress(token, "token");
    ensureAddressList(initialAdmins, "initialAdmins");
    ensureInteger(threshold, "threshold", 1);
    const sourceAccount = await this.getAccountForTx(admin, horizonUrl);
    const tx = await this.prepareTransaction(
      "create_pool",
      sourceAccount,
      scvAddress(admin),
      scvSymbol(poolId),
      scvAddress(token),
      scvAddressVec(initialAdmins),
      scvU32(Number(threshold))
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /** Create a pool on-chain through the transaction queue and return its identifier and tx hash. */
  async createPoolAndSubmit(
    admin: string,
    poolId: string,
    token: string,
    initialAdmins: string[],
    threshold: number | bigint,
    signer: QueueSigner,
    opts?: RunOptions,
    horizonUrl?: string
  ): Promise<{ poolId: string; transactionHash: string }> {
    const tx = await this.prepareCreatePoolTx(
      admin,
      poolId,
      token,
      initialAdmins,
      threshold,
      horizonUrl
    );
    const transactionHash = await this.submitTransaction(tx, signer, opts);
    return { poolId, transactionHash };
  }

  /**
   * Deposit tokens into a pool.
   *
   * @param depositor The Stellar public key of the user depositing tokens.
   * @param poolId The ID of the pool.
   * @param token The contract ID of the token.
   * @param amount The amount to deposit.
   * @returns A base64-encoded transaction XDR built with a throwaway keypair (not directly submittable).
   *
   * @example
   * ```ts
   * const txOp = client.poolDeposit("GBFOY...", "my-pool-1", "CABC123...", 1000n);
   * console.log("Deposit Op XDR:", txOp);
   * ```
   */
  poolDeposit(depositor: string, poolId: string, token: string, amount: number | bigint): string {
    ensureAddress(depositor, "depositor");
    ensureNonEmptyString(poolId, "poolId");
    ensureAddress(token, "token");
    ensurePositiveInteger(amount, "amount");
    return super.poolDeposit(depositor, poolId, token, BigInt(amount));
  }

  /**
   * Build a submittable pool_deposit transaction with the caller as the proper source account.
   *
   * @param depositor The Stellar public key of the user depositing tokens.
   * @param poolId The ID of the pool.
   * @param token The contract ID of the token.
   * @param amount The amount to deposit.
   * @param horizonUrl Optional Horizon URL to use. Defaults based on the network passphrase.
   * @returns The base64-encoded transaction envelope XDR ready for wallet signing.
   */
  async preparePoolDepositTx(
    depositor: string,
    poolId: string,
    token: string,
    amount: number | bigint,
    horizonUrl?: string
  ): Promise<string> {
    ensureAddress(depositor, "depositor");
    ensureNonEmptyString(poolId, "poolId");
    ensureAddress(token, "token");
    ensurePositiveInteger(amount, "amount");
    const sourceAccount = await this.getAccountForTx(depositor, horizonUrl);
    const tx = await this.prepareTransaction(
      "pool_deposit",
      sourceAccount,
      scvAddress(depositor),
      scvSymbol(poolId),
      scvAddress(token),
      scvI128(amount)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /** Deposit a positive token amount into a pool through the transaction queue. */
  async depositToPoolAndSubmit(
    depositor: string,
    poolId: string,
    token: string,
    amount: number | bigint,
    signer: QueueSigner,
    opts?: RunOptions,
    horizonUrl?: string
  ): Promise<string> {
    ensurePositiveInteger(amount, "amount");
    const tx = await this.preparePoolDepositTx(depositor, poolId, token, amount, horizonUrl);
    return this.submitTransaction(tx, signer, opts);
  }

  /**
   * Build a submittable SEP-41 `increase_allowance` transaction against the
   * token contract, authorizing the pool contract to spend the depositor's
   * tokens during `pool_deposit`.
   *
   * @param depositor The Stellar public key of the token holder granting the allowance.
   * @param token The contract ID of the SEP-41 token.
   * @param spender The contract / account authorized to spend (the pool contract).
   * @param amount The amount to approve in stroops.
   * @param horizonUrl Optional Horizon URL to use. Defaults based on the network passphrase.
   * @returns The base64-encoded transaction envelope XDR ready for wallet signing.
   */
  async prepareIncreaseAllowanceTx(
    depositor: string,
    token: string,
    spender: string,
    amount: number | bigint,
    horizonUrl?: string
  ): Promise<string> {
    ensureAddress(depositor, "depositor");
    ensureAddress(token, "token");
    ensureAddress(spender, "spender");
    ensurePositiveInteger(amount, "amount");
    const sourceAccount = await this.getAccountForTx(depositor, horizonUrl);
    const tx = await this.prepareTransactionOnContract(
      "increase_allowance",
      token,
      sourceAccount,
      scvAddress(depositor),
      scvAddress(spender),
      scvI128(amount)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /**
   * Withdraw tokens from a pool (requires multi-sig authorization).
   *
   * @param signers Array of Stellar public keys of the admins authorizing the withdrawal.
   * @param poolId The ID of the pool.
   * @param amount The amount to withdraw.
   * @param recipient The Stellar public key to receive the tokens.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.poolWithdraw(
   *   ["GBFOY...", "GCO23..."],
   *   "my-pool-1",
   *   500n,
   *   "GDX..."
   * );
   * console.log("Withdraw Op XDR:", txOp);
   * ```
   */
  poolWithdraw(
    signers: string[],
    poolId: string,
    amount: number | bigint,
    recipient: string
  ): string {
    ensureAddressList(signers, "signers");
    ensureNonEmptyString(poolId, "poolId");
    ensurePositiveInteger(amount, "amount");
    ensureAddress(recipient, "recipient");
    return super.poolWithdraw(signers, poolId, BigInt(amount), recipient);
  }

  /**
   * Build a submittable pool_withdraw transaction with the caller as the proper
   * source account.
   *
   * @param signers Array of Stellar public keys of the admins authorizing the withdrawal.
   * @param poolId The ID of the pool.
   * @param amount The amount to withdraw.
   * @param recipient The Stellar public key to receive the tokens.
   * @param horizonUrl Optional Horizon URL to use. Defaults based on the network passphrase.
   * @returns The base64-encoded transaction envelope XDR ready for wallet signing.
   */
  async preparePoolWithdrawTx(
    signers: string[],
    poolId: string,
    amount: number | bigint,
    recipient: string,
    horizonUrl?: string
  ): Promise<string> {
    ensureAddressList(signers, "signers");
    ensureNonEmptyString(poolId, "poolId");
    ensurePositiveInteger(amount, "amount");
    ensureAddress(recipient, "recipient");
    const sourceAccount = await this.getAccountForTx(signers[0], horizonUrl);
    const tx = await this.prepareTransaction(
      "pool_withdraw",
      sourceAccount,
      scvAddressVec(signers),
      scvSymbol(poolId),
      scvI128(amount),
      scvAddress(recipient)
    );
    return tx.toEnvelope().toXDR("base64");
  }

  /**
   * Add a new admin to a pool.
   *
   * @param signers Array of Stellar public keys of the admins authorizing the addition.
   * @param poolId The ID of the pool.
   * @param newAdmin The Stellar public key of the new admin.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.addPoolAdmin(["GBFOY..."], "my-pool-1", "GDX...");
   * console.log("Add Admin Op XDR:", txOp);
   * ```
   */
  addPoolAdmin(signers: string[], poolId: string, newAdmin: string): string {
    ensureAddressList(signers, "signers");
    ensureNonEmptyString(poolId, "poolId");
    ensureAddress(newAdmin, "newAdmin");
    return super.addPoolAdmin(signers, poolId, newAdmin);
  }

  /**
   * Remove an admin from a pool.
   *
   * @param signers Array of Stellar public keys of the admins authorizing the removal.
   * @param poolId The ID of the pool.
   * @param admin The Stellar public key of the admin to remove.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.removePoolAdmin(["GBFOY...", "GCO23..."], "my-pool-1", "GDX...");
   * console.log("Remove Admin Op XDR:", txOp);
   * ```
   */
  removePoolAdmin(signers: string[], poolId: string, admin: string): string {
    ensureAddressList(signers, "signers");
    ensureNonEmptyString(poolId, "poolId");
    ensureAddress(admin, "admin");
    return super.removePoolAdmin(signers, poolId, admin);
  }

  /**
   * Update the signature threshold required for pool actions.
   *
   * @param signers Array of Stellar public keys of the admins authorizing the change.
   * @param poolId The ID of the pool.
   * @param threshold The new signature threshold.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.updatePoolThreshold(["GBFOY...", "GCO23..."], "my-pool-1", 3n);
   * console.log("Update Threshold Op XDR:", txOp);
   * ```
   */
  updatePoolThreshold(signers: string[], poolId: string, threshold: number | bigint): string {
    ensureAddressList(signers, "signers");
    ensureNonEmptyString(poolId, "poolId");
    ensureInteger(threshold, "threshold", 1);
    return super.updatePoolThreshold(signers, poolId, Number(threshold));
  }

  /**
   * Set the protocol fee in basis points (admin only).
   *
   * @param feeBps The new fee in basis points (e.g., 100 = 1%).
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.setFee(150n); // 1.5%
   * console.log("Set Fee Op XDR:", txOp);
   * ```
   */
  setFee(feeBps: number | bigint): string {
    ensureInteger(feeBps, "feeBps", 0);
    return super.setFee(Number(feeBps));
  }

  /**
   * Set the treasury address where protocol fees are collected (admin only).
   *
   * @param treasury The Stellar public key of the new treasury.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.setTreasury("GBFOY...");
   * console.log("Set Treasury Op XDR:", txOp);
   * ```
   */
  setTreasury(treasury: string): string {
    ensureAddress(treasury, "treasury");
    return super.setTreasury(treasury);
  }

  /**
   * Set the tip cooldown window in ledgers (admin only).
   *
   * @param cooldownLedgers The number of ledgers before a user can tip again.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.setTipCooldownWindow(17280n); // Approx 1 day
   * console.log("Set Cooldown Op XDR:", txOp);
   * ```
   */
  setTipCooldownWindow(cooldownLedgers: number | bigint): string {
    ensureInteger(cooldownLedgers, "cooldownLedgers", 0);
    return super.setTipCooldownWindow(Number(cooldownLedgers));
  }

  /**
   * Build a transaction envelope for `verify_analytics_attestation`.
   *
   * @param oracleName The name of the oracle symbol.
   * @param reportCbor The CBOR-encoded report bytes.
   * @param signature The cryptographic signature of the report.
   * @param creator The Stellar public key of the creator.
   * @param windowStart The start timestamp of the window.
   * @param windowEnd The end timestamp of the window.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @example
   * ```ts
   * const txOp = client.verifyAnalyticsAttestation(
   *   "ORACLE_1",
   *   new Uint8Array([0xa1, 0x61, ...]),
   *   new Uint8Array([...]),
   *   "GBFOY...",
   *   1670000000,
   *   1670086400
   * );
   * console.log("Verify Attestation Op XDR:", txOp);
   * ```
   */
  verifyAnalyticsAttestation(
    oracleName: string,
    reportCbor: Uint8Array,
    signature: Uint8Array,
    creator: string,
    windowStart: number | bigint,
    windowEnd: number | bigint
  ): string {
    ensureNonEmptyString(oracleName, "oracleName");
    ensureMaxBytes(reportCbor, "reportCbor");
    ensureMaxBytes(signature, "signature");
    ensureAddress(creator, "creator");
    ensureInteger(windowStart, "windowStart", 0);
    ensureInteger(windowEnd, "windowEnd", 0);
    return super.verifyAnalyticsAttestation(
      oracleName,
      reportCbor,
      signature,
      creator,
      windowStart,
      windowEnd
    );
  }

  // ── Token Factory Methods ────────────────────────────────────────────────────

  /**
   * Build a transaction XDR that calls `deploy_creator_token` on the token
   * factory contract.
   *
   * Requires `tokenFactoryId` to be set in `ClientConfig`.
   *
   * @param params The token deployment parameters.
   * @returns The base64-encoded XDR of the transaction operation.
   *
   * @throws {ValidationError} If `tokenFactoryId` is not configured.
   *
   * @example
   * ```ts
   * const txOp = client.deployCreatorToken({
   *   deployer: "GBFOY...",
   *   name: "Alice Token",
   *   symbol: "ALC",
   *   decimals: 7,
   *   initialSupply: 1000000n
   * });
   * console.log("Deploy Token Op XDR:", txOp);
   * ```
   */
  deployCreatorToken(params: DeployCreatorTokenParams, sourceAccount?: Account): string {
    if (!this.tokenFactoryId) {
      throw new ValidationError(
        "tokenFactoryId must be set in ClientConfig to use deployCreatorToken",
        {
          field: "tokenFactoryId",
        }
      );
    }
    if (!sourceAccount) {
      const tempSource = Keypair.random();
      const tempAccount = new Account(tempSource.publicKey(), "0");
      return this.buildTxForSubmit(
        this.tokenFactoryId,
        tempAccount,
        "deploy_creator_token",
        scvAddress(params.deployer),
        scvString(params.name),
        scvString(params.symbol),
        scvU32(params.decimals),
        scvI128(params.initialSupply)
      );
    }
    return this.buildTxForSubmit(
      this.tokenFactoryId,
      sourceAccount,
      "deploy_creator_token",
      scvAddress(params.deployer),
      scvString(params.name),
      scvString(params.symbol),
      scvU32(params.decimals),
      scvI128(params.initialSupply)
    );
  }

  /**
   * Build two sequential transaction XDRs that together deploy a creator token
   * and set the user's profile with the new token address.
   *
   * Requires `tokenFactoryId` to be set in `ClientConfig`.
   *
   * @param params The parameters for setting the profile and deploying the token.
   * @returns A tuple of `[deployTxXdr, setProfileTxXdr]`.
   *
   * @throws {ValidationError} If `tokenFactoryId` is not configured.
   *
   * @example
   * ```ts
   * const [deployOp, profileOp] = client.setProfileWithNewToken({
   *   user: "GBFOY...",
   *   username: "alice",
   *   tokenParams: {
   *     name: "Alice Token",
   *     symbol: "ALC",
   *     decimals: 7,
   *     initialSupply: 1000000n
   *   }
   * });
   * console.log("Deploy Op:", deployOp, "Profile Op:", profileOp);
   * ```
   */
  async setProfileWithNewToken(
    params: SetProfileWithNewTokenParams,
    sourceAccount?: Account
  ): Promise<[string, string]> {
    if (!this.tokenFactoryId) {
      throw new ValidationError(
        "tokenFactoryId must be set in ClientConfig to use setProfileWithNewToken",
        {
          field: "tokenFactoryId",
        }
      );
    }

    const deployTx = this.deployCreatorToken(
      {
        deployer: params.user,
        ...params.tokenParams,
      },
      sourceAccount
    );

    const tokenAddress = await this.simulateDeployCreatorToken({
      deployer: params.user,
      ...params.tokenParams,
    });

    if (!tokenAddress) {
      throw new Error("Failed to determine the deployed creator token contract ID.");
    }

    const profileTx = this.setProfile(params.user, params.username, tokenAddress);
    return [deployTx, profileTx];
  }

  /**
   * Simulate `deploy_creator_token` to determine the token address that would
   * be created. Does not submit a transaction.
   *
   * Requires `tokenFactoryId` to be set in `ClientConfig`.
   *
   * @param params The token deployment parameters.
   * @returns The expected contract ID of the deployed token, or null if simulation fails.
   *
   * @throws {ValidationError} If `tokenFactoryId` is not configured.
   *
   * @example
   * ```ts
   * const tokenAddress = await client.simulateDeployCreatorToken({
   *   deployer: "GBFOY...",
   *   name: "Alice Token",
   *   symbol: "ALC",
   *   decimals: 7,
   *   initialSupply: 1000000n
   * });
   * console.log("Expected token address:", tokenAddress);
   * ```
   */
  async simulateDeployCreatorToken(params: DeployCreatorTokenParams): Promise<string | null> {
    if (!this.tokenFactoryId) {
      throw new ValidationError(
        "tokenFactoryId must be set in ClientConfig to use simulateDeployCreatorToken",
        { field: "tokenFactoryId" }
      );
    }
    const retval = await this.simulateCallOnContract(
      this.tokenFactoryId,
      "deploy_creator_token",
      scvAddress(params.deployer),
      scvString(params.name),
      scvString(params.symbol),
      scvU32(params.decimals),
      scvI128(params.initialSupply)
    );
    if (!retval) return null;
    const native = scValToNative(retval);
    return native == null ? null : (native as string);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Build a read-only simulation XDR using a throwaway keypair. Not suitable for submission. */
  private buildSimTx(contractId: string, method: string, ...args: xdr.ScVal[]): string {
    const contract = new Contract(contractId);
    const op = contract.call(method, ...args);

    const source = Keypair.random();
    const account = new Account(source.publicKey(), "0");
    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this._networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(DEFAULT_TIMEOUT)
      .build();

    return tx.toEnvelope().toXDR("base64");
  }

  /** Build a submittable write transaction XDR using the caller's actual account. */
  private buildTxForSubmit(
    contractId: string,
    sourceAccount: Account,
    method: string,
    ...args: xdr.ScVal[]
  ): string {
    const contract = new Contract(contractId);
    const op = contract.call(method, ...args);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: this._networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(DEFAULT_TIMEOUT)
      .build();

    return tx.toEnvelope().toXDR("base64");
  }

  private async simulateCallOnContract(
    contractId: string,
    method: string,
    ...args: xdr.ScVal[]
  ): Promise<xdr.ScVal | null> {
    const server = this._rpcServer;
    const contract = new Contract(contractId);
    const op = contract.call(method, ...args);

    const source = Keypair.random();
    const account = new Account(source.publicKey(), "0");
    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this._networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(DEFAULT_TIMEOUT)
      .build();

    const result = await server.simulateTransaction(tx);

    if (isSimulationError(result)) {
      throw mapError(result.error);
    }
    if (!isSimulationSuccess(result) || !result.result) return null;

    return result.result.retval;
  }
}
