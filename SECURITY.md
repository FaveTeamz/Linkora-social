# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Linkora, please **do not open a public GitHub issue**.

Instead, report it privately by emailing **security@linkora.xyz** or by opening a [GitHub Security Advisory](https://github.com/julianajohn7202-stack/Linkora-social/security/advisories/new) in this repository.

Please include:

- A clear description of the vulnerability and its potential impact.
- Steps to reproduce (proof-of-concept code or a minimal test case if available).
- The component affected (smart contract, indexer, relay, SDK, web, mobile).
- Your contact information so we can follow up.

We aim to acknowledge reports within **48 hours** and to provide a remediation timeline within **7 days**.

---

## Responsible Disclosure

We ask that you:

- Give us reasonable time to investigate and patch before any public disclosure.
- Avoid accessing, modifying, or deleting data belonging to other users.
- Not exploit a discovered vulnerability beyond what is necessary to demonstrate the issue.

---

## Smart Contract Security

Linkora's on-chain logic is implemented as a Soroban smart contract on the Stellar network (`packages/contracts`). On-chain bugs can have irreversible financial consequences, so this section describes known attack surfaces, the existing mitigations, and how to report contract-specific issues.

### Known Attack Vectors

#### Re-entrancy

Soroban's execution model is single-threaded and does not allow cross-contract callbacks to re-enter a partially-executed invocation frame. However, any future integration that calls into external contracts (e.g. DEX adapters, token wrappers) must be designed with re-entrancy in mind:

- Complete all internal state mutations **before** making any outbound cross-contract call.
- Treat values returned by external contracts as untrusted until validated.

#### Integer Overflow and Underflow

All arithmetic on token amounts, tip fees, pool balances, and governance vote weights must be checked:

- Soroban's `i128`/`u128` types do not automatically panic on overflow in release builds. Use `.checked_add()`, `.checked_sub()`, `.checked_mul()`, and `.checked_div()` everywhere amounts are combined.
- The fuzz tests in `tests/fuzz_tip.rs` and `tests/invariants.rs` specifically target fee-split arithmetic to catch overflow and rounding errors — see [Fuzz Tests](#fuzz-tests) below.

#### Authentication Bypass

Every state-mutating entry point must verify the caller's identity via Soroban's `env.require_auth(address)`:

- Missing or misplaced `require_auth` calls allow arbitrary accounts to mutate contract state on behalf of another user.
- Governance proposal execution must additionally check quorum and vote thresholds before applying any side-effects.
- The `errors.rs` module defines `AuthError` variants; any new entry point that introduces a permission check should use these variants consistently so errors are machine-readable by the indexer.

#### Oracle / Price Feed Manipulation

The analytics oracle (`services/analytics-oracle`) feeds engagement data back on-chain. An attacker who can control oracle input can skew creator rankings, governance vote weights, or pool reward distributions. Mitigations:

- Oracle submissions must be signed by a whitelisted oracle keypair (`ORACLE_SIGNING_KEY` in the environment).
- Large single-block jumps in oracle-reported values should be rate-limited at the contract level.

#### Front-running and Transaction Ordering

Stellar's consensus does not guarantee transaction ordering within a ledger when multiple transactions compete for the same account sequence number. Sensitive operations such as tip submission and pool withdrawals are inherently exposed to front-running on public mempools.

---

### Fuzz Tests

Property-based fuzz tests live in `packages/contracts/contracts/linkora-contracts/tests/` and run as part of the standard `cargo test` suite (no nightly toolchain required):

| File                                                                                                                  | What it covers                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`tests/fuzz_tip.rs`](./packages/contracts/contracts/linkora-contracts/tests/fuzz_tip.rs)                             | Fee-split arithmetic: overflow, rounding, conservation invariants        |
| [`tests/fuzz_social_graph.rs`](./packages/contracts/contracts/linkora-contracts/tests/fuzz_social_graph.rs)           | Follow/unfollow/block state-machine properties                           |
| [`tests/fuzz_governance.rs`](./packages/contracts/contracts/linkora-contracts/tests/fuzz_governance.rs)               | Governance vote counting, quorum calculation, proposal lifecycle         |
| [`tests/fuzz_credential.rs`](./packages/contracts/contracts/linkora-contracts/tests/fuzz_credential.rs)               | Credential / auth payload parsing and rejection of malformed inputs      |
| [`tests/fuzz_oracle.rs`](./packages/contracts/contracts/linkora-contracts/tests/fuzz_oracle.rs)                       | Oracle submission validation and value range enforcement                 |
| [`tests/invariants.rs`](./packages/contracts/contracts/linkora-contracts/tests/invariants.rs)                         | Cross-cutting accounting invariants (balances, counts, fee conservation) |
| [`tests/invariant_social_graph.rs`](./packages/contracts/contracts/linkora-contracts/tests/invariant_social_graph.rs) | Follow/like/tip count consistency across arbitrary operation sequences   |

Run them locally:

```bash
cd packages/contracts
cargo test -p linkora-contracts
```

See [`packages/contracts/contracts/linkora-contracts/tests/FUZZING.md`](./packages/contracts/contracts/linkora-contracts/tests/FUZZING.md) for guidance on adding new invariants.

---

### Responsible Disclosure for On-Chain Bugs

On-chain vulnerabilities are particularly urgent because:

1. Transactions are irreversible once included in a ledger.
2. Funds held in pools or tip escrows are at direct risk.
3. Governance state corruption can affect the entire protocol.

If you find a contract-level bug, please:

1. **Do not exploit it** — even on testnet, as testnet state is used for integration testing.
2. Email **security@linkora.xyz** with the subject line `[Contract Bug] <short description>`.
3. Include the affected entry point(s), a minimal reproduction, and an estimate of the impact (funds at risk, accounts affected, etc.).
4. We will work with you on a coordinated disclosure timeline and, where applicable, a bug bounty reward.

---

## Scope

| In scope                                | Out of scope                                |
| --------------------------------------- | ------------------------------------------- |
| `packages/contracts` — Soroban contract | Third-party libraries (report upstream)     |
| `packages/sdk` — TypeScript client      | Public testnet funds (no real value)        |
| `services/indexer` — REST/WebSocket API | UI cosmetic issues                          |
| `services/dm-relay` — E2EE relay        | Rate-limiting tuning requests               |
| `apps/web`, `apps/mobile` — frontends   | Theoretical issues with no proof-of-concept |

---

## Supported Versions

Security fixes are applied to the **latest main branch** only. Older tags do not receive backported patches.
