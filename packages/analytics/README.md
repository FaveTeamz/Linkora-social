# @linkora/analytics

On-chain analytics package for the Linkora SocialFi platform. Provides the event catalogue, creator metrics types, and query helpers used by the analytics oracle (`services/analytics-oracle`) and downstream consumers.

---

## Table of Contents

1. [Event Catalogue](#event-catalogue)
2. [CreatorMetrics Fields](#creatormetrics-fields)
3. [Querying Metrics by Period](#querying-metrics-by-period)
4. [Data Retention](#data-retention)

---

## Event Catalogue

The analytics oracle emits and consumes the following named events. Each event name corresponds to a distinct action tracked on-chain or off-chain by the indexer.

| Event Name                     | Source   | Description                                                                                          |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| `post.created`                 | Contract | Emitted when a new post is created via `create_post`. Topics: `id`, `author`.                        |
| `post.deleted`                 | Contract | Emitted when an author deletes a post via `delete_post`. Topics: `post_id`, `author`.                |
| `post.liked`                   | Contract | Emitted when a user likes a post via `like_post`. Topics: `user`, `post_id`.                         |
| `post.reported`                | Contract | Emitted when a post is reported via `report_post`. Topics: `post_id`, `reporter`.                    |
| `profile.set`                  | Contract | Emitted when a profile is created or updated via `set_profile`. Topics: `user`.                      |
| `profile.deleted`              | Contract | Emitted when a profile is deleted via `delete_profile`. Topics: `user`.                              |
| `social.follow`                | Contract | Emitted when a user follows another via `follow`. Topics: `follower`, `followee`.                    |
| `social.unfollow`              | Contract | Emitted when a user unfollows another via `unfollow`. Topics: `follower`, `followee`.                |
| `social.block`                 | Contract | Emitted when a user blocks another via `block_user`. Topics: `blocker`, `blocked`.                   |
| `social.unblock`               | Contract | Emitted when a user unblocks another via `unblock_user`. Topics: `blocker`, `blocked`.               |
| `tip.sent`                     | Contract | Emitted on successful tip via `tip_post`. Topics: `tipper`, `post_id`. Data: `amount`, `fee`.        |
| `pool.created`                 | Contract | Emitted when a community pool is created. Topics: `pool_id`. Data: `token`, `admins`, `threshold`.   |
| `pool.deposit`                 | Contract | Emitted when a user deposits into a pool. Topics: `depositor`, `pool_id`. Data: `amount`.            |
| `pool.withdraw`                | Contract | Emitted when a pool admin withdraws funds. Topics: `recipient`, `pool_id`. Data: `amount`.           |
| `governance.proposal_created`  | Contract | Emitted on new governance proposal. Topics: `proposal_id`. Data: `proposer`, `parameter`.            |
| `governance.vote`              | Contract | Emitted when a user votes on a proposal. Topics: `proposal_id`, `voter`. Data: `support`.            |
| `governance.proposal_executed` | Contract | Emitted when a passed proposal is executed. Topics: `proposal_id`.                                   |
| `governance.proposal_vetoed`   | Contract | Emitted when an Admin vetoes a proposal. Topics: `proposal_id`.                                      |
| `analytics.attested`           | Oracle   | Emitted when the oracle submits a signed attestation on-chain. Topics: `oracle_name`, `report_hash`. |
| `dm.key_published`             | Contract | Emitted when a user publishes an X25519 DM public key. Topics: `user`.                               |
| `credential.root_updated`      | Contract | Emitted when a user's credential Merkle root is updated. Topics: `user`.                             |
| `credential.verified`          | Contract | Emitted on successful credential proof verification. Topics: `user`, `nullifier`.                    |
| `moderation.report_dismissed`  | Contract | Emitted when a report is dismissed. Topics: `post_id`, `reporter`.                                   |
| `moderation.post_removed`      | Contract | Emitted when a post is removed by moderation. Topics: `post_id`, `reporter`.                         |
| `contract.paused`              | Contract | Emitted when an admin pauses the contract. Topics: `admin`.                                          |
| `contract.unpaused`            | Contract | Emitted when an admin unpauses the contract. Topics: `admin`.                                        |
| `contract.upgraded`            | Contract | Emitted on WASM contract upgrade. Data: `new_wasm_hash`.                                             |

---

## CreatorMetrics Fields

`CreatorMetrics` (called `AnalyticsReport` in the oracle's internal types) is the core data structure produced per creator per ledger window. All numeric fields are aggregated over the window defined by `windowStart` and `windowEnd`.

| Field           | Type         | Description                                                                                            |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| `version`       | `u8`         | Schema version of the report (currently `1`). Used for forward-compatibility.                          |
| `creator`       | `Uint8Array` | 32-byte raw Ed25519 public key of the creator's Stellar address.                                       |
| `windowStart`   | `bigint`     | Inclusive ledger sequence number at the start of the analytics window (u64).                           |
| `windowEnd`     | `bigint`     | Inclusive ledger sequence number at the end of the analytics window (u64).                             |
| `totalTips`     | `bigint`     | Net tip amount received by the creator in the window, in stroops (u128). 1 XLM = 10,000,000 stroops.   |
| `postCount`     | `bigint`     | Number of posts created by the creator in the window (u64).                                            |
| `followerDelta` | `bigint`     | Net change in follower count over the window (i64). Positive = net new followers; negative = net loss. |
| `uniqueTippers` | `number`     | Number of distinct addresses that tipped the creator at least once in the window (u32).                |

The report is serialised as a CBOR array in the field order listed above, then SHA-256 hashed and Ed25519 signed by the oracle before being submitted on-chain.

---

## Querying Metrics by Period

The analytics oracle exposes a REST endpoint that returns the latest signed attestation for a given creator address. Each attestation includes the full `CreatorMetrics` payload along with the oracle signature and on-chain transaction hash.

### Endpoint

```
GET /attestations/:creator
```

| Parameter | Type   | Description                                               |
| --------- | ------ | --------------------------------------------------------- |
| `creator` | string | Stellar public key of the creator (`G...`, 56 characters) |

### Example request

```bash
curl https://oracle.linkora.io/attestations/GABC...XYZ
```

### Example response

```json
{
  "oracleName": "default",
  "reportHash": "a3f1...",
  "reportCbor": "8701...",
  "signature": "9e4d...",
  "txHash": "4a2b...",
  "submittedAt": 1727600000000,
  "report": {
    "version": 1,
    "creator": "ab12...",
    "windowStart": "5120000",
    "windowEnd": "5121000",
    "totalTips": "50000000",
    "postCount": "12",
    "followerDelta": "34",
    "uniqueTippers": 8
  }
}
```

`totalTips` and other `bigint` fields are serialised as decimal strings in the JSON response to avoid IEEE 754 precision loss.

### Querying a specific period

The oracle runs one window per `WINDOW_LEDGERS` interval (default 1000 ledgers ≈ 83 minutes). To query a specific historical period, use the indexer's search API which stores all attested reports indexed by `windowStart` and `windowEnd`:

```bash
# Fetch all attestations for a creator in a ledger range
curl "https://indexer.linkora.io/api/analytics?creator=GABC...XYZ&from=5120000&to=5125000"
```

---

## Data Retention

| Layer               | Retention policy                                                                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On-chain**        | Attestation nullifiers (`AttestationNullifier`) are stored persistently; they are never pruned (replay guard).                                                                                                                            |
| **Oracle cache**    | In-memory cache with a configurable TTL (default 1 hour via `ATTESTATION_CACHE_TTL_MS`). Evicted entries are lost unless already committed on-chain. Maximum size is controlled by `ATTESTATION_CACHE_MAX_SIZE` (default 10,000 entries). |
| **Indexer DB**      | Attested reports are written to PostgreSQL by the indexer and retained indefinitely by default. Apply a retention policy at the database level if long-term storage cost is a concern.                                                    |
| **Soroban storage** | Persistent contract storage has a TTL of ~30 days (535,000 ledgers). The oracle bumps storage on each attestation; gaps longer than the TTL require a rent payment to restore access.                                                     |

> **Note:** The oracle never stores the raw private signing key in its cache or logs. Only the public-key fingerprint is written to audit logs.
