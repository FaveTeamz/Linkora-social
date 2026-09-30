# Contributing to Linkora

Thank you for your interest in contributing! This document covers the
development workflow, branch conventions, and the PR process.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Development Setup](#2-development-setup)
3. [Branch Conventions](#3-branch-conventions)
4. [Commit Message Style](#4-commit-message-style)
5. [Pull Request Process](#5-pull-request-process)
6. [Adding SDK Client Methods](#6-adding-sdk-client-methods)
7. [Code Style](#7-code-style)

---

## 1. Prerequisites

- **Node.js** ≥ 18 (see `.node-version`)
- **pnpm** ≥ 8 — install with `npm install -g pnpm`
- **Docker** ≥ 24 with Compose v2 (for local service tests)
- **Rust** + `cargo` (for smart contract tests)

---

## 2. Development Setup

```bash
# Clone and install all workspace dependencies
git clone https://github.com/ijayabby/Linkora-social.git
cd Linkora-social
./scripts/setup.sh         # checks prerequisites, installs deps, builds contracts

# Run the web frontend
cd apps/web && pnpm dev    # http://localhost:3000

# Run the indexer locally
cd services/indexer
cp .env.example .env       # fill in DATABASE_URL and STELLAR_RPC_URL
pnpm dev

# Run smart-contract tests
pnpm --filter contracts test
```

---

## 3. Branch Conventions

| Branch name pattern                        | Use case                           |
| ------------------------------------------ | ---------------------------------- |
| `feat/<short-description>`                 | New feature                        |
| `fix/<short-description>`                  | Bug fix                            |
| `docs/<short-description>`                 | Documentation only                 |
| `chore/<short-description>`                | Build, tooling, or dependency bump |
| `refactor/<short-description>`             | Code restructuring without new behaviour |

Always branch from `main`:

```bash
git checkout main && git pull
git checkout -b feat/my-feature
```

---

## 4. Commit Message Style

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <short summary>

<optional body>

<optional footer: Closes #<issue-number>>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`.

---

## 5. Pull Request Process

1. Open a PR against `main`.
2. Fill in the PR template: summary of changes, what was tested, any blocked features.
3. Keep the PR title under 70 characters. Use the description for details.
4. Reference the issue it closes in the description: `Closes #<number>`.
5. All CI checks must pass before merging.
6. At least one code-owner review is required (see `.github/CODEOWNERS`).

---

## 6. Adding SDK Client Methods

The SDK (`packages/sdk`) exposes the Linkora smart contract through a single
typed `LinkoraClient` class. This section explains the internal patterns you
need to follow when adding new methods.

### 6.1 Where to add your method

All client methods live in `packages/sdk/src/client.ts`. The class is large by
design — there is one file per domain rather than one file per method. Group
related methods under a clearly labelled region comment:

```ts
// ── Posts ─────────────────────────────────────────────────────────────────
```

If the contract gains an entirely new domain (e.g. governance 2.0, badges),
you can extract it into a sibling file (e.g. `packages/sdk/src/badges.ts`) and
re-export from `packages/sdk/src/index.ts`, but discuss the split in your PR
first — consistency matters more than file size.

### 6.2 Method anatomy

Every SDK method follows the same four-step pattern:

1. **Validate inputs** — reject bad values early with a typed error.
2. **Encode arguments** — convert TypeScript values to `xdr.ScVal`.
3. **Build the transaction XDR** — use `prepareTransactionXdr` for write
   methods or the inherited `read*` helpers for read methods.
4. **Return the result** — write methods return `Promise<string>` (XDR);
   read methods return the decoded TypeScript value.

#### Read method example

```ts
/**
 * Get a creator profile by Stellar address.
 *
 * @param address - The Stellar public key of the creator (G…).
 * @returns The creator's profile or `null` when no profile is registered.
 *
 * @throws {InvalidInputError} If `address` is not a valid Stellar public key.
 *
 * @example
 * ```ts
 * const profile = await client.getProfile("GBFOY...");
 * console.log(profile?.username);
 * ```
 */
async getProfile(address: string): Promise<Profile | null> {
  // 1. Validate
  ensureAddress(address, "address");

  // 2. Encode
  const args = [scvAddress(address)];

  // 3. Call the contract (read — no signing required)
  const result = await this.readContract("get_profile", args);

  // 4. Decode and return
  return result ? (scValToNative(result) as Profile) : null;
}
```

#### Write method example

Write methods build unsigned transaction XDR. The caller signs it (typically
via Freighter) and submits it through `TransactionQueue`.

```ts
/**
 * Create a new post.
 *
 * @param author  - The author's Stellar public key.
 * @param content - Post body text (max 64 KB).
 * @returns Unsigned transaction XDR that the caller must sign and submit.
 *
 * @throws {InvalidInputError} If `author` is not a valid address or `content`
 *   exceeds the 64 KB on-chain limit.
 *
 * @example
 * ```ts
 * const xdr = await client.createPost("GBFOY...", "Hello Linkora!");
 * // Sign and submit via TransactionQueue (see §6.3)
 * ```
 */
async createPost(author: string, content: string): Promise<string> {
  // 1. Validate
  ensureAddress(author, "author");
  ensureNonEmptyString(content, "content");
  const encoded = new TextEncoder().encode(content);
  ensureMaxBytes(encoded, "content");

  // 2. Encode
  const args = [scvAddress(author), scvString(content)];

  // 3. Build unsigned transaction XDR
  return this.prepareTransactionXdr("create_post", author, args);
}
```

The private helper `prepareTransactionXdr(method, sourceAddress, args)` calls
`prepareTransaction` with a temporary sequence number so that the full
simulation runs before the user signs. The caller receives base64 XDR that is
ready to sign.

### 6.3 Using TransactionQueue for multi-step submissions

`TransactionQueue` (`packages/sdk/src/queue.ts`) handles ordered multi-step
Stellar transactions: it signs, optionally simulates (dry run), submits, polls
for confirmation, and emits `TxStatusEvent`s at every state transition. Each
step may register a `rollback` callback invoked if a later step fails.

**When to use it:**

- Any write that requires more than one transaction (e.g. `increase_allowance`
  → `tip`).
- Any write where you want deterministic rollback on partial failure.
- Any write where you want real-time fee / status feedback in the UI.

**Basic usage:**

```ts
import { TransactionQueue } from "@linkora/sdk";

const queue = new TransactionQueue(client, {
  signer: freighterSigner,   // implements QueueSigner.signTransaction()
  stepTimeoutMs: 60_000,     // abort a step after 60 seconds
});

// Listen for status events
queue.onStatus((event) => {
  console.log(`Step ${event.index}: ${event.status}`, event.hash);
});

// Add steps (each is an unsigned XDR string)
await queue.add({
  xdr: await client.increaseAllowance(userAddress, contractId, amount),
  rollback: () => console.warn("Allowance step rolled back"),
});

await queue.add({
  xdr: await client.tip(userAddress, postId, tokenId, amount),
});

// Execute all steps in order
await queue.run();
```

**Dry-run mode** (fee estimation without on-chain submission):

```ts
await queue.run({ dryRun: true });
// status events will have dryRun: true and no hash
```

**Implementing `QueueSigner`:**

```ts
import type { QueueSigner } from "@linkora/sdk";

const freighterSigner: QueueSigner = {
  async signTransaction(xdr: string): Promise<string> {
    return await window.freighterApi.signTransaction(xdr, { network: "TESTNET" });
  },
};
```

### 6.4 Input validation helpers

Use the private helpers already in `client.ts` rather than writing ad-hoc
validation. They throw typed errors (`InvalidInputError`, `ValidationError`)
that callers can distinguish from network errors:

| Helper | Use for |
| ------ | ------- |
| `ensureAddress(value, fieldName)` | Stellar public key or contract address |
| `ensureNonEmptyString(value, fieldName)` | Any non-blank string |
| `ensureInteger(value, fieldName, min?)` | Integer ≥ min (returns `bigint`) |
| `ensurePositiveInteger(value, fieldName)` | Integer ≥ 1 (returns `bigint`) |
| `ensureMaxBytes(encoded, fieldName, max?)` | Byte array within the 64 KB contract limit |
| `ensureAddressList(values, fieldName)` | Array of Stellar addresses |

These helpers are private to `client.ts`. If you add a new validation case that
will be needed by more than one method, add a helper in the same private-helpers
region and document it here.

### 6.5 Encoding helpers

Use the typed encoding shortcuts at the top of `client.ts`:

| Helper | Produces |
| ------ | -------- |
| `scvAddress(value)` | `xdr.ScVal` address |
| `scvString(value)` | `xdr.ScVal` string (bytes) |
| `scvU32(value)` | `xdr.ScVal` u32 |
| `scvU64(value)` | `xdr.ScVal` u64 |
| `scvI128(value)` | `xdr.ScVal` i128 |
| `scvSymbol(value)` | `xdr.ScVal` symbol |
| `scvAddressVec(values)` | `xdr.ScVal` vec of addresses |

Do not call `nativeToScVal` directly in new methods — always go through these
helpers so type constraints are enforced consistently.

### 6.6 Writing unit tests for new SDK methods

Tests live in `packages/sdk/src/__tests__/`. Follow the pattern established in
`read.test.ts` and `write.test.ts`:

1. Mock `@stellar/stellar-sdk/rpc` and `@stellar/stellar-base` with `jest.mock`.
2. Create a client with a dummy `contractId` and `rpcUrl`.
3. Test the happy path: assert the correct contract method name and argument
   values are forwarded.
4. Test validation: assert that invalid inputs throw `InvalidInputError` or
   `ValidationError` with descriptive messages.

**Example — testing a new write method:**

```ts
// packages/sdk/src/__tests__/my-feature.test.ts
import { LinkoraClient } from "../client";
import { InvalidInputError } from "../errors";

// Re-use the mock factory from write.test.ts — mock stellar-base
jest.mock("@stellar/stellar-sdk/rpc", () => ({
  Server: jest.fn(),
  Api: { isSimulationError: jest.fn(), isSimulationSuccess: jest.fn() },
}));

const mockCall = jest.fn();
const mockBuild = jest.fn();
const mockToEnvelope = jest.fn();
const mockToXDR = jest.fn();
const mockAddOperation = jest.fn();
const mockSetTimeout = jest.fn();

jest.mock("@stellar/stellar-base", () => ({
  Contract: jest.fn(() => ({ call: mockCall })),
  Address: {
    fromString: jest.fn((v: string) => ({
      toScVal: () => ({ _type: "scval", _val: v }),
    })),
  },
  StrKey: {
    isValidEd25519PublicKey: jest.fn((v: string) => v.startsWith("G")),
  },
  nativeToScVal: jest.fn((val: unknown, opts?: unknown) => ({
    _type: "scval",
    _val: val,
    _opts: opts,
  })),
  scValToNative: jest.fn(),
  TransactionBuilder: jest.fn(() => ({ addOperation: mockAddOperation })),
  Account: jest.fn(),
  Keypair: { random: jest.fn(() => ({ publicKey: () => "GDUMMY" })) },
  xdr: {},
}));

const XDR = "AAAAfakexdrbase64encodedstring";

describe("LinkoraClient.createPost", () => {
  let client: LinkoraClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new LinkoraClient({ contractId: "CDUMMY", rpcUrl: "https://dummy.example.com" });
    mockAddOperation.mockReturnValue({ setTimeout: mockSetTimeout });
    mockSetTimeout.mockReturnValue({ build: mockBuild });
    mockBuild.mockReturnValue({ toEnvelope: mockToEnvelope });
    mockToEnvelope.mockReturnValue({ toXDR: mockToXDR });
    mockToXDR.mockReturnValue(XDR);
  });

  it("returns XDR for a valid post", () => {
    const result = client.createPost("GBFOY...", "Hello Linkora!");
    expect(result).toBe(XDR);
    // Assert the correct contract method was called
    expect(mockCall).toHaveBeenCalledWith(
      "create_post",
      expect.objectContaining({ _val: "GBFOY..." }),
      expect.objectContaining({ _val: "Hello Linkora!" })
    );
  });

  it("throws InvalidInputError for an empty author address", () => {
    expect(() => client.createPost("", "Hello")).toThrow(InvalidInputError);
  });

  it("throws InvalidInputError for an empty content string", () => {
    expect(() => client.createPost("GBFOY...", "  ")).toThrow(InvalidInputError);
  });
});
```

Run the unit tests with:

```bash
pnpm --filter sdk test
```

To run only your new test file:

```bash
pnpm --filter sdk test -- --testPathPattern=my-feature
```

---

## 7. Code Style

- TypeScript strict mode is enabled for all packages.
- ESLint (`pnpm lint`) and Prettier (`pnpm format`) are enforced via the
  pre-commit hook.
- Max line length: 100 characters.
- All exported symbols must have JSDoc comments (type, param, returns, throws,
  example).
- No `console.log` in library code — use structured logging in services.
