# Analytics Oracle

The `services/analytics-oracle` service is an off-chain daemon that aggregates
creator activity from the indexer database and submits signed, tamper-proof
attestations to the Linkora smart contract on Soroban. On-chain consumers (and
front-end clients) can then read a creator's verified analytics without querying
the database directly.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Sources](#2-data-sources)
3. [Attestation Flow](#3-attestation-flow)
4. [On-Chain Submission](#4-on-chain-submission)
5. [TTL and Cache Behaviour](#5-ttl-and-cache-behaviour)
6. [Architecture Diagram](#6-architecture-diagram)
7. [API Endpoint Reference](#7-api-endpoint-reference)
8. [Configuration Reference](#8-configuration-reference)
9. [Key Security Notes](#9-key-security-notes)

---

## 1. Overview

The analytics oracle runs a polling loop keyed to Soroban ledger sequence
numbers. Once per configured **window** (default: every 1 000 ledgers, ≈ 83 min
at 5 s/ledger) it:

1. Reads the latest ledger from Soroban RPC.
2. Queries the indexer PostgreSQL database for creator activity in that window.
3. Encodes each creator report as CBOR.
4. Signs the report hash with an Ed25519 oracle key.
5. Submits the signed attestation to the contract via `verify_analytics_attestation`.
6. Caches the signed attestation in-process (configurable TTL).

An HTTP server runs concurrently, exposing the cached attestations for clients
that want to read them without an on-chain call.

---

## 2. Data Sources

### Indexer PostgreSQL Database

The oracle queries the same PostgreSQL instance used by the indexer service.
The query runs against three tables:

| Table       | Used for                                                        |
| ----------- | --------------------------------------------------------------- |
| `posts`     | Count posts created by each author in the window                |
| `tips`      | Sum tip amounts and count distinct tippers per author           |
| `follows`   | Count follow events per creator in the window                   |
| `unfollows` | Count unfollow events per creator in the window (for net delta) |

A single SQL query (`fetchCreatorStats` in `src/db.ts`) returns one row per
active creator:

| Field            | Type     | Description                                     |
| ---------------- | -------- | ----------------------------------------------- |
| `creatorAddress` | `string` | Stellar public key (`G…`) of the creator        |
| `totalTips`      | `bigint` | Net tip amount received in the window (stroops) |
| `postCount`      | `bigint` | Posts created in the window                     |
| `followerDelta`  | `bigint` | Net follower change (`follows − unfollows`)     |
| `uniqueTippers`  | `number` | Distinct addresses that tipped this creator     |

Creators with no activity in the window are excluded; the oracle skips the
window entirely if the result set is empty.

### Soroban RPC

The oracle uses `rpc.Server.getLatestLedger()` to determine the current ledger
sequence and `rpc.Server.getAccount()` to fetch the oracle's source account for
transaction building.

---

## 3. Attestation Flow

```
for each active creator in window:

  1.  fetchCreatorStats (PostgreSQL)  →  CreatorStats
  2.  build AnalyticsReport struct
  3.  encode report as CBOR           →  reportCbor (Buffer)
  4.  sha256(reportCbor)              →  reportHash (32 bytes)
  5.  Ed25519_sign(reportHash, oraclePrivKey)  →  signature (64 bytes)
  6.  submitAttestation(reportCbor, signature, …)
  7.  store SignedAttestation in in-process cache
```

### AnalyticsReport Structure (`src/types.ts`)

```typescript
interface AnalyticsReport {
  version: number; // u8, currently 1
  creator: Uint8Array; // 32-byte raw public key
  windowStart: bigint; // u64 inclusive ledger sequence
  windowEnd: bigint; // u64 inclusive ledger sequence
  totalTips: bigint; // u128 net tips in stroops
  postCount: bigint; // u64 posts created in window
  followerDelta: bigint; // i64 net follower change
  uniqueTippers: number; // u32 distinct tippers
}
```

### CBOR Encoding

`src/codec.ts` encodes the report as a deterministic CBOR array (field order
matches the struct definition above) so the on-chain verifier can reproduce the
same byte sequence from the submitted fields.

### Ed25519 Signing (`src/signer.ts`)

The `Signer` class wraps a raw 32-byte Ed25519 seed:

- `signReport(reportCbor)` — hashes the CBOR with SHA-256, then signs the 32-byte
  digest using `@noble/ed25519`.
- `rotate(newSeed)` — atomically swaps the active signing key and zeroes the
  previous seed on the heap (supports key rotation without a restart).
- `dispose()` — zeroes the seed on shutdown.

The oracle **never** logs private key material; audit log lines contain only the
public key fingerprint (hex).

---

## 4. On-Chain Submission

`submitAttestation` in `src/submitter.ts` builds and sends a Soroban transaction
calling:

```
verify_analytics_attestation(
  oracle_name: Symbol,
  report_cbor: Bytes,
  signature:   Bytes,
  creator:     Address,
  window_start: u64,
  window_end:   u64
)
```

### Retry Logic

All submissions are wrapped in `withRetry` (exponential backoff, up to 3
retries by default):

| Error type          | Behaviour                                        |
| ------------------- | ------------------------------------------------ |
| Transient (network) | Retried with exponential backoff (1 s, 2 s, 4 s) |
| Simulation failure  | Not retried (the transaction is invalid)         |
| 5xx from RPC        | Retried                                          |

Each attempt re-fetches the source account sequence number and re-simulates the
transaction so the `LedgerFootprint` is always fresh.

### Footprint Growth Warning

The submitter tracks the `LedgerFootprint` from the most recent successful
simulation. If the footprint grows (more ledger keys accessed) compared to the
previous attestation, a `WARN` log line is emitted. This is not an error — it
can happen when the contract writes new storage keys — but it is surfaced for
operator visibility.

---

## 5. TTL and Cache Behaviour

Signed attestations are stored in `AttestationCache` (`src/attestation-cache.ts`),
a bounded in-process LRU-style cache.

| Parameter                    | Default     | Description                              |
| ---------------------------- | ----------- | ---------------------------------------- |
| `ATTESTATION_CACHE_MAX_SIZE` | `10 000`    | Maximum number of creators held in cache |
| `ATTESTATION_CACHE_TTL_MS`   | `3 600 000` | Eviction TTL per entry (1 hour)          |

Two automatic eviction mechanisms keep the cache bounded:

1. **Window invalidation** — `beginWindow(start, end)` is called at the start of
   each new poll cycle, marking entries from the previous window as belonging to
   a closed window. Stale attestations are not served once the oracle has begun
   computing a new window.
2. **TTL sweep** — a background `setInterval` purges entries whose TTL has
   expired. The sweep interval is `max(TTL / 4, 5 min)`.

If the oracle's signing key is rotated via the admin API, `setSignerId` is
called with the new key fingerprint, which clears every cached signature
produced under the old key.

---

## 6. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  Indexer PostgreSQL                                              │
│  posts · tips · follows · unfollows                              │
└────────────────────────┬─────────────────────────────────────────┘
                         │ fetchCreatorStats (SQL)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Analytics Oracle  (services/analytics-oracle)                   │
│                                                                  │
│  1. Poll loop (every WINDOW_LEDGERS × 5 s)                       │
│     └─ getLatestLedger (Soroban RPC)                             │
│                                                                  │
│  2. For each active creator:                                     │
│     ├─ encode AnalyticsReport → CBOR                             │
│     ├─ sha256(CBOR) → reportHash                                 │
│     └─ Ed25519_sign(reportHash, oracleKey) → signature           │
│                                                                  │
│  3. submitAttestation (Soroban RPC)                              │
│     └─ verify_analytics_attestation(...)  →  txHash              │
│                                                                  │
│  4. Cache: AttestationCache (bounded, TTL-evicted)               │
│                                                                  │
│  HTTP API                                                        │
│  GET /attestations/:creator  →  SignedAttestation (JSON)         │
│  GET /metrics/cache          →  cache stats                      │
│  POST /admin/rotate-key      →  key rotation (admin only)        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ verify_analytics_attestation (XDR)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Linkora Smart Contract  (packages/contracts)                    │
│  stores on-chain oracle attestation for creator                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. API Endpoint Reference

The oracle exposes an HTTP server (default port `4000`). All endpoints are
unauthenticated read-only except the admin routes.

### `GET /attestations/:creator`

Returns the most recent cached attestation for a creator.

**Path parameters**

| Parameter | Type   | Description                         |
| --------- | ------ | ----------------------------------- |
| `creator` | string | Stellar public key (`G…`, 56 chars) |

**Response `200 OK`**

```json
{
  "oracleName": "default",
  "reportHash": "<hex sha256 of the CBOR report>",
  "reportCbor": "<hex-encoded CBOR bytes>",
  "signature": "<hex-encoded 64-byte Ed25519 signature>",
  "txHash": "<Stellar transaction hash>",
  "submittedAt": 1735689600000,
  "report": {
    "version": 1,
    "creator": "<hex raw public key>",
    "windowStart": "12345000",
    "windowEnd": "12346000",
    "totalTips": "500000000",
    "postCount": "12",
    "followerDelta": "3",
    "uniqueTippers": 5
  }
}
```

**Response `404 Not Found`** — no attestation in cache for this creator (either
the creator was inactive in the last window or the cache has been evicted).

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "no attestation found for this creator",
    "requestId": "..."
  }
}
```

---

### `GET /metrics/cache`

Returns cache statistics for observability.

**Response `200 OK`**

```json
{
  "size": 42,
  "maxSize": 10000,
  "ttlMs": 3600000,
  "signerId": "<hex public key fingerprint of the active signing key>"
}
```

---

### `GET /health/live`

Kubernetes liveness probe. Returns `200` as long as the process is running.

---

### `GET /health/ready`

Kubernetes readiness probe. Returns `200` only after the oracle has completed
its first poll window. Returns `503` during startup or graceful shutdown.

---

### `GET /health/startup`

Kubernetes startup probe. Returns `200` once startup is complete.

---

### `POST /admin/rotate-key`

Atomically replaces the active Ed25519 signing key. Requires a bearer token
matching `ADMIN_SECRET`.

**Headers**

```
Authorization: Bearer <ADMIN_SECRET>
```

**Request body**

```json
{
  "seed": "<hex-encoded 32-byte Ed25519 seed>"
}
```

**Response `200 OK`**

```json
{
  "fingerprint": "<hex public key of the new signing key>"
}
```

Rotating the key clears all cached attestations produced under the previous key.

---

## 8. Configuration Reference

All configuration is supplied via environment variables. Copy `.env.example` to
`.env` and fill in the required values.

| Variable                         | Required  | Default                      | Description                                                                 |
| -------------------------------- | --------- | ---------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`                   | ✅        | —                            | PostgreSQL connection string for the indexer database                       |
| `SOROBAN_RPC_URL`                | ✅        | —                            | Soroban RPC endpoint                                                        |
| `CONTRACT_ID`                    | ✅        | —                            | Linkora contract address                                                    |
| `SECRETS`                        | ✅        | `env:ORACLE_PRIVATE_KEY_HEX` | Key source: `file://<path>` or `env:<VAR>` (file recommended in production) |
| `ORACLE_PRIVATE_KEY_HEX`         | dev only  | —                            | 32-byte Ed25519 seed as hex (only when `SECRETS=env:…`)                     |
| `ADMIN_SECRET`                   | ✅ (prod) | —                            | Bearer token for `POST /admin/rotate-key`                                   |
| `NETWORK_PASSPHRASE`             |           | Testnet                      | Stellar network passphrase                                                  |
| `ORACLE_NAME`                    |           | `default`                    | Oracle identifier stored alongside each attestation                         |
| `WINDOW_LEDGERS`                 |           | `1000`                       | Number of ledgers per analytics window                                      |
| `PORT`                           |           | `4000`                       | HTTP server port                                                            |
| `ATTESTATION_CACHE_MAX_SIZE`     |           | `10000`                      | Maximum entries in the attestation cache                                    |
| `ATTESTATION_CACHE_TTL_MS`       |           | `3600000`                    | Entry TTL in milliseconds (0 = no TTL eviction)                             |
| `REDIS_URL`                      | ✅ (prod) | —                            | Redis endpoint for shared rate-limit state (required in production)         |
| `ORACLE_RATE_LIMIT_WINDOW_MS`    |           | `60000`                      | Rate-limit window in milliseconds                                           |
| `ORACLE_RATE_LIMIT_MAX_REQUESTS` |           | `10`                         | Max requests per IP per window                                              |
| `ORACLE_RATE_LIMIT_BYPASS_IPS`   |           | —                            | Comma-separated IPs exempt from rate limiting                               |
| `SHUTDOWN_DRAIN_TIMEOUT_MS`      |           | `30000`                      | Maximum time to wait for in-flight submissions during shutdown              |

---

## 9. Key Security Notes

- **Never pass the oracle private key as an environment variable in production.**
  Use `SECRETS=file:///run/secrets/oracle-key.hex` backed by a Docker secret,
  Kubernetes secret volume, or AWS Secrets Manager mounted file.
- The raw seed bytes are zeroed from memory immediately after the `Signer` is
  constructed, and again during graceful shutdown via `dispose()`.
- `REDIS_URL` is required when `NODE_ENV=production` and more than one replica
  is running. Without it, each replica maintains its own rate-limit counter and
  an attacker behind a load balancer gets `limit × replicaCount` throughput.
- `ADMIN_SECRET` must be high-entropy (at least 32 random bytes, base64 or hex
  encoded). Leaving it empty disables the admin routes entirely.
