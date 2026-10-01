# Contributing to Linkora

Thank you for your interest in contributing! This guide covers environment
setup, branch conventions, the PR process, and — in the section below — a
detailed walkthrough for adding new SDK client methods.

---

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Branch Conventions](#branch-conventions)
3. [Pull Request Process](#pull-request-process)
4. [Adding SDK Client Methods](#adding-sdk-client-methods)
   - [Module Layout](#module-layout)
   - [The Two Write-Method Variants](#the-two-write-method-variants)
   - [Using the TransactionQueue Pattern](#using-the-transactionqueue-pattern)
   - [Writing Unit Tests for SDK Methods](#writing-unit-tests-for-sdk-methods)
5. [Contract Tests](#contract-tests)

---

## Environment Setup

```bash
# Check prerequisites, install dependencies, and build contracts
./scripts/setup.sh
```

Prerequisites: Node.js ≥ 20 (see `.node-version`), pnpm, Rust + `cargo`, and
the Soroban CLI. The setup script will tell you if anything is missing.

---

## Branch Conventions

| Branch type  | Naming pattern              | Example                       |
| ------------ | --------------------------- | ----------------------------- |
| Feature      | `feat/<short-description>`  | `feat/add-bookmark-client`    |
| Bug fix      | `fix/<short-description>`   | `fix/queue-circuit-reset`     |
| Docs         | `docs/<short-description>`  | `docs/sdk-contributing-guide` |
| Chore / deps | `chore/<short-description>` | `chore/bump-stellar-sdk`      |

Branch off `main`. Keep your branch short-lived and focused on a single change.

---

## Pull Request Process

1. Push your branch and open a PR against `main`.
2. The CI pipeline runs lint, type-check, contract tests, and SDK unit tests.
   All checks must pass before review.
3. Every PR needs at least one approving review from a codeowner.
4. Squash-merge once approved. Keep the commit title under 70 characters.

---

## Adding SDK Client Methods

The SDK lives in `packages/sdk/src/`. Below is a step-by-step guide for
adding a new method that exposes a Linkora contract function to TypeScript
callers.

### Module Layout

```
packages/sdk/src/
├── client.ts          ← Main LinkoraClient class — add new methods here
├── generated/
│   ├── client.ts      ← Auto-generated base class (do NOT edit by hand)
│   └── types.ts       ← Auto-generated contract types
├── queue.ts           ← TransactionQueue implementation
├── errors.ts          ← Shared error hierarchy
├── types.ts           ← Shared TypeScript types (Profile, Post, Pool, …)
├── index.ts           ← Public re-exports
└── __tests__/
    ├── read.test.ts   ← Unit tests for read (view) methods
    ├── write.test.ts  ← Unit tests for write (mutation) methods
    └── queue.test.ts  ← Unit tests for the TransactionQueue
```

`LinkoraClient` in `client.ts` extends `GeneratedLinkoraClient` from
`generated/client.ts`. The generated layer is regenerated from the contract
ABI via `packages/codegen/generate.ts` and must not be edited by hand. All
hand-written logic — validation, error mapping, `prepare*Tx` methods — belongs
in `client.ts`.

### The Two Write-Method Variants

Every mutable contract function is surfaced as **two** TypeScript methods with
distinct responsibilities.

#### 1. Base write method (throwaway XDR)

The base method calls the contract and returns base64-encoded XDR built with a
throwaway `Keypair`. **This XDR is not directly submittable** — it has no real
sequence number and will be rejected by the network with `tx_bad_seq` if
submitted as-is. Its purpose is to extract the Soroban `Operation` for
batching (e.g., `buildMultiOpTx`) or for server-side queuing where sequence
management is owned by `TransactionQueue`.

```typescript
// In packages/sdk/src/client.ts

/**
 * Bookmark a post.
 *
 * Returns a base64-encoded transaction XDR built with a throwaway keypair.
 * This XDR is NOT directly submittable — pass it to buildMultiOpTx or
 * TransactionQueue instead.
 *
 * @param user    The Stellar public key of the user bookmarking the post.
 * @param postId  The ID of the post to bookmark.
 * @returns Base64-encoded XDR of the transaction operation.
 */
bookmarkPost(user: string, postId: number | bigint): string {
  ensureAddress(user, "user");
  ensurePositiveInteger(postId, "postId");
  return super.bookmarkPost(user, BigInt(postId));  // delegates to generated layer
}
```

Validation rules:

- Use `ensureAddress` for Stellar public keys and contract IDs.
- Use `ensureNonEmptyString` for text fields.
- Use `ensurePositiveInteger` / `ensureInteger` for numeric IDs and amounts.
- Convert `number | bigint` → `BigInt` when passing to `super.*`.

#### 2. `prepare*Tx` method (submittable)

The `prepare*Tx` variant is the **intended path for client-side applications**.
It fetches the real account sequence from Horizon, simulates the transaction to
discover the resource fee and ledger footprint, and returns a fully assembled
base64 XDR envelope that a wallet (e.g. Freighter) can sign and submit.

```typescript
/**
 * Build a submittable bookmark_post transaction.
 *
 * Fetches the current account sequence from Horizon, simulates the call to
 * discover fees and footprint, and returns a base64 XDR envelope ready for
 * wallet signing.
 *
 * @param user        The Stellar public key of the user.
 * @param postId      The ID of the post to bookmark.
 * @param horizonUrl  Optional Horizon URL override.
 * @returns Base64-encoded transaction envelope XDR ready for signing.
 */
async prepareBookmarkPostTx(
  user: string,
  postId: number | bigint,
  horizonUrl?: string
): Promise<string> {
  ensureAddress(user, "user");
  ensurePositiveInteger(postId, "postId");

  const sourceAccount = await this.getAccountForTx(user, horizonUrl);
  const tx = await this.prepareTransaction(
    "bookmark_post",
    sourceAccount,
    scvAddress(user),
    scvU64(BigInt(postId))
  );
  return tx.toEnvelope().toXDR("base64");
}
```

Use the `scv*` helpers already defined at the top of `client.ts` to encode
arguments as `xdr.ScVal`:

| Helper       | Soroban type                    |
| ------------ | ------------------------------- |
| `scvAddress` | `address` (account or contract) |
| `scvString`  | `string` / `bytes`              |
| `scvU32`     | `u32`                           |
| `scvU64`     | `u64`                           |
| `scvI128`    | `i128`                          |
| `scvSymbol`  | `symbol`                        |

#### Putting it together — a full example

The pattern used by every existing method pair (e.g. `follow` /
`prepareFollowTx`, `createPost` / `prepareCreatePostTx`) is:

```typescript
// ── 1. Base write method ────────────────────────────────────────────────────

bookmarkPost(user: string, postId: number | bigint): string {
  ensureAddress(user, "user");
  ensurePositiveInteger(postId, "postId");
  return super.bookmarkPost(user, BigInt(postId));
}

// ── 2. prepare*Tx method ────────────────────────────────────────────────────

async prepareBookmarkPostTx(
  user: string,
  postId: number | bigint,
  horizonUrl?: string
): Promise<string> {
  ensureAddress(user, "user");
  ensurePositiveInteger(postId, "postId");
  const sourceAccount = await this.getAccountForTx(user, horizonUrl);
  const tx = await this.prepareTransaction(
    "bookmark_post",
    sourceAccount,
    scvAddress(user),
    scvU64(BigInt(postId))
  );
  return tx.toEnvelope().toXDR("base64");
}
```

If your new contract function is a **read (view)** method, you only need one
variant — override the generated method with error handling and `NotFoundError`
conversion, just like `getProfile` and `getPost` do.

### Using the TransactionQueue Pattern

`TransactionQueue` is the right tool when you need to submit one or more
transactions in order, with automatic retry, circuit-breaking, and rollback
support. Import it from the SDK root.

#### Basic single-step submission

```typescript
import { LinkoraClient, TransactionQueue, FreighterSigner } from "linkora-sdk";

const client = new LinkoraClient({ contractId: "C...", rpcUrl: "https://..." });
const signer = new FreighterSigner(); // or your own QueueSigner implementation

// Convenience wrapper — signs, submits, and polls for confirmation
const txHash = await client.submitTransaction(
  await client.prepareBookmarkPostTx("GUSER...", 42n),
  signer
);
console.log("Confirmed:", txHash);
```

#### Multi-step sequence with rollbacks

When several operations must succeed together, enqueue them in order and attach
a `rollback` callback to each step that compensates for its side-effects if a
later step fails.

```typescript
const queue = new TransactionQueue({
  signer,
  rpc: client.rpcServer,
  retry: { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30_000, jitterFactor: 0.5 },
});

// Each enqueue() call accepts an optional rollback thunk
queue
  .enqueue(await client.prepareFollowTx("GUSER...", "GCREATOR..."), async () => {
    // compensate: unfollow if later step fails
    await client.submitTransaction(
      await client.prepareUnfollowTx("GUSER...", "GCREATOR..."),
      signer
    );
  })
  .enqueue(await client.prepareBookmarkPostTx("GUSER...", 42n));

// Listen for granular status events
queue.on("status", (event) => {
  console.log(`Step ${event.index}: ${event.status}`);
  if (event.status === "confirmed" && !event.dryRun) {
    console.log("On-chain hash:", event.hash);
  }
});

await queue.run();
```

#### Dry-run mode

Pass `dryRun: true` to `run()` to simulate every step without broadcasting.
The queue still emits `confirmed` events, but they carry `dryRun: true` and no
`hash`. Use this for fee estimation and preflight validation:

```typescript
await queue.run({ dryRun: true });
// No transactions were broadcast; check event.resourceFee for cost estimates
```

#### Circuit-breaker awareness

After `circuitBreakerThreshold` consecutive retryable failures the circuit
opens and `run()` throws a `CircuitBreakerError`. Check `queue.isCircuitOpen`
to decide whether to surface a "service unavailable" message to the user
before retrying.

```typescript
try {
  await queue.run();
} catch (err) {
  if (queue.isCircuitOpen) {
    console.error("RPC endpoint is unhealthy — please try again later.");
  }
  throw err;
}
```

### Writing Unit Tests for SDK Methods

All SDK tests use **Jest** with `ts-jest`. The test runner is configured in
`packages/sdk/jest.config.js`. Run them with:

```bash
pnpm --filter sdk test
# or from the sdk directory:
cd packages/sdk && pnpm test
```

Tests live in `packages/sdk/src/__tests__/`. Follow the existing
`write.test.ts` / `read.test.ts` conventions.

#### Testing a base write method

Mock out `@stellar/stellar-base` and `@stellar/stellar-sdk/rpc` at the top of
the test file (or reuse the mocks already in `write.test.ts`). Assert that the
right contract method name and correctly typed `ScVal` arguments are forwarded
to `contract.call`.

```typescript
// packages/sdk/src/__tests__/write.test.ts  (add inside the existing describe block)

it("bookmarkPost", () => {
  // client is set up in beforeEach with full builder chain mocked
  expect(client.bookmarkPost("GUSER", 42)).toBe(XDR);
  expect(mockCall).toHaveBeenCalledWith(
    "bookmark_post",
    addr("GUSER"), // scvAddress
    val(42n) // scvU64 — note: bigint
  );
});
```

The helpers `addr(s)` and `val(v)` used in the existing tests are:

```typescript
const addr = (s: string) => expect.objectContaining({ _val: s });
const val = (v: unknown) => expect.objectContaining({ _val: v });
```

#### Testing input validation

Each `ensure*` helper should throw for bad input. Test the unhappy paths too:

```typescript
it("bookmarkPost rejects invalid address", () => {
  expect(() => client.bookmarkPost("not-an-address", 1)).toThrow(InvalidInputError);
});

it("bookmarkPost rejects non-positive postId", () => {
  expect(() => client.bookmarkPost("GUSER", 0)).toThrow(InvalidInputError);
});
```

#### Testing a `prepare*Tx` method

The `prepare*Tx` methods call `this.getAccountForTx` (which hits Horizon) and
`this.prepareTransaction` (which calls `rpc.Server.simulateTransaction`). Mock
both to keep tests fast and offline:

```typescript
import { Account } from "@stellar/stellar-base";
import { LinkoraClient } from "../client";

// At the top of the describe block, spy on the private helpers:
let prepareTransactionSpy: jest.SpyInstance;
let getAccountSpy: jest.SpyInstance;

beforeEach(() => {
  const fakeAccount = new Account("GUSER...", "100");
  getAccountSpy = jest
    .spyOn(client as unknown as { getAccountForTx: () => Promise<Account> }, "getAccountForTx")
    .mockResolvedValue(fakeAccount);

  prepareTransactionSpy = jest.spyOn(client, "prepareTransaction").mockResolvedValue({
    toEnvelope: () => ({ toXDR: () => "AAAApreparedxdr" }),
  } as unknown as ReturnType<typeof client.prepareTransaction>);
});

it("prepareBookmarkPostTx calls prepareTransaction with correct args", async () => {
  const result = await client.prepareBookmarkPostTx("GUSER", 42n);

  expect(result).toBe("AAAApreparedxdr");
  expect(prepareTransactionSpy).toHaveBeenCalledWith(
    "bookmark_post",
    expect.anything(), // Account
    addr("GUSER"), // scvAddress
    expect.objectContaining({ _opts: { type: "u64" } }) // scvU64
  );
});
```

See `write.test.ts` lines 274–310 for the existing `prepareCreatePostTx` and
`prepareFollowTx` tests as concrete reference implementations.

#### Testing the TransactionQueue

`queue.test.ts` provides reusable `makeSigner` and `makeRpc` factory helpers.
Copy the pattern when writing queue-level tests for a new method:

```typescript
import { TransactionQueue } from "../queue";

it("confirms a bookmark step", async () => {
  const events: TxStatusEvent[] = [];
  const rpc = makeRpc(); // from queue.test.ts helpers
  const queue = new TransactionQueue({ signer: makeSigner(), rpc, pollIntervalMs: 0 });
  queue.on("status", (e) => events.push(e));
  queue.enqueue("XDR_BOOKMARK");

  await queue.run();

  expect(events.map((e) => e.status)).toEqual(["pending", "simulated", "submitted", "confirmed"]);
});
```

---

## Contract Tests

Contract unit tests are written in Rust and live in
`packages/contracts/contracts/`. Run them with:

```bash
pnpm --filter contracts test
# or:
cd packages/contracts && cargo test
```

If your SDK method exposes a new contract function, make sure the corresponding
Rust contract entry point is covered before wiring up the TypeScript layer.
