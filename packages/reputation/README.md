# @linkora/reputation

Reputation scoring primitives for the Linkora SocialFi protocol. This package
computes off-chain reputation scores from on-chain signals (followers, tips,
posts, likes, governance participation) and maps them to display tiers consumed
by the web and mobile frontends.

> **Status:** Implementation in progress. The scoring formula and tier
> thresholds documented here reflect the design spec. The `src/index.ts` stub
> will be replaced with the full implementation.

---

## Table of Contents

1. [Scoring Signals and Weights](#scoring-signals-and-weights)
2. [Scoring Formula](#scoring-formula)
3. [Tier Thresholds](#tier-thresholds)
4. [Code Example](#code-example)
5. [On-Chain Reputation Module](#on-chain-reputation-module)
6. [Data Sources](#data-sources)

---

## Scoring Signals and Weights

A reputation score is a weighted sum of normalised on-chain signals. Each
signal is sourced from events emitted by `LinkoraContract` on Stellar/Soroban
and aggregated by the analytics oracle (`services/analytics-oracle`).

| Signal              | Weight | Source                                   | Notes                                             |
| ------------------- | ------ | ---------------------------------------- | ------------------------------------------------- |
| Follower count      | 0.30   | `FollowersCount` storage key             | Counts unique followers; capped at 100 000        |
| Tips received       | 0.25   | `Post.tip_total` (sum across all posts)  | In stroops (1 XLM = 10 000 000 stroops)           |
| Post engagement     | 0.20   | `Post.like_count` (sum across all posts) | Counts distinct likes; duplicate likes are no-ops |
| Post volume         | 0.10   | `get_post_count` per author              | Decays if posts are deleted (tombstoned)          |
| Governance activity | 0.10   | `GovVote` events for the address         | Counts distinct proposal votes cast               |
| Credential verified | 0.05   | `credential.verified` contract event     | Binary (0 or 1); rewards verified identity        |

Weights sum to **1.00**. They are governance-adjustable on-chain via
`GovParameter` proposals (see [On-Chain Reputation Module](#on-chain-reputation-module)).

---

## Scoring Formula

Each signal is normalised to `[0, 1]` using a soft logarithmic cap so that
large values do not dominate:

```
normalise(value, cap) = min(value, cap) / cap
```

The composite raw score is then:

```
rawScore =
  0.30 * normalise(followerCount,    100_000)  +
  0.25 * normalise(tipsReceivedXLM,  10_000)   +
  0.20 * normalise(totalLikes,       50_000)   +
  0.10 * normalise(postCount,        500)      +
  0.10 * normalise(govVoteCount,     100)      +
  0.05 * credentialVerified                    -- 0 or 1
```

`tipsReceivedXLM` is derived by converting the on-chain stroop total:

```
tipsReceivedXLM = tipTotalStroops / 10_000_000
```

The final **reputation score** is an integer in `[0, 10,000]`:

```
score = Math.round(rawScore * 10_000)
```

---

## Tier Thresholds

| Tier       | Score range  | Display badge |
| ---------- | ------------ | ------------- |
| ◎ Unranked | 0 – 999      | —             |
| 🥉 Bronze  | 1,000 – 2,999 | Bronze badge  |
| 🥈 Silver  | 3,000 – 5,999 | Silver badge  |
| 🥇 Gold    | 6,000 – 8,499 | Gold badge    |
| 💎 Diamond | 8,500 – 10,000 | Diamond badge |

Tier boundaries are intentionally generous at the low end to reward early
participation and progressively harder to reach at the top.

---

## Code Example

```ts
import { computeScore, scoreToTier } from "@linkora/reputation";

// Gather on-chain signals for a creator address.
// In practice these come from the indexer REST API or the analytics oracle.
const signals = {
  followerCount: 3_200,
  tipTotalStroops: BigInt("125_000_000"), // 12.5 XLM
  totalLikes: 8_750,
  postCount: 42,
  govVoteCount: 7,
  credentialVerified: true,
};

// Compute the integer score [0, 10,000].
const score = computeScore(signals);
console.log(score); // e.g. 4,120

// Map the score to a display tier.
const tier = scoreToTier(score);
console.log(tier); // "silver"
```

### `computeScore(signals, customWeights?)`

```ts
interface ReputationSignals {
  /** Total number of unique followers (from FollowersCount storage key). */
  followerCount: number;
  /** Sum of tip_total across all posts the creator has authored, in stroops. */
  tipTotalStroops: bigint;
  /** Sum of like_count across all posts the creator has authored. */
  totalLikes: number;
  /** Number of posts created by the author (from get_post_count per author). */
  postCount: number;
  /** Number of distinct governance proposals voted on by the address. */
  govVoteCount: number;
  /** Whether the address has at least one verified credential on-chain. */
  credentialVerified: boolean;
}

/** Returns an integer score in [0, 10,000]. */
function computeScore(signals: ReputationSignals, customWeights?: ScoreWeights): number;
```

### `scoreToTier(score)`

```ts
type ReputationTier = "unranked" | "bronze" | "silver" | "gold" | "diamond";
type ScoreWeights = Partial<Record<keyof ReputationSignals, number>>;

/** Maps a score in [0, 10,000] to the corresponding tier string. */
function scoreToTier(score: number): ReputationTier;
```

---

## On-Chain Reputation Module

Reputation scores are **computed off-chain** from on-chain data. The authoritative
source of truth is `LinkoraContract` deployed on Stellar/Soroban.

Relevant contract functions and storage keys:

| On-chain concept        | Contract entry point / storage key                                         |
| ----------------------- | -------------------------------------------------------------------------- |
| Follower count          | `get_followers(user, offset, limit)` / `FollowersCount(Address)`           |
| Tips received           | `get_post(id)` → `Post.tip_total`; sum across `get_posts_by_author`        |
| Post likes              | `get_like_count(post_id)`; sum per author                                  |
| Post count              | `get_post_count()` (global); iterate `get_posts_by_author`                 |
| Governance votes        | `GovVote` events (indexed by `services/indexer`)                           |
| Credential verification | `verify_credential(user, proof, path, leaf)` → `credential.verified` event |

The analytics oracle (`services/analytics-oracle`) aggregates these signals
per ledger window and submits signed `AnalyticsReport` attestations on-chain
via `verify_analytics_attestation`. These attested reports are the primary
input to `computeReputationScore`.

See the full contract API reference at
[`docs/CONTRACT_API.md`](../../docs/CONTRACT_API.md) and the analytics oracle
design at [`docs/indexer/ANALYTICS_ORACLE.md`](../../docs/indexer/ANALYTICS_ORACLE.md).

---

## Data Sources

Reputation signals can be fetched from two layers:

**Indexer REST API** — fast, queryable, eventually consistent with on-chain state.

```bash
# Follower count for a creator
GET https://indexer.linkora.io/api/profiles/{address}/followers/count

# Aggregated tip total for a creator
GET https://indexer.linkora.io/api/analytics?creator={address}
```

**Analytics Oracle** — cryptographically attested `CreatorMetrics` reports.
See [`packages/analytics/README.md`](../analytics/README.md) for the full
field reference and how to query attestations.

> **Note:** The reputation package does not make network requests itself. It
> accepts a plain `ReputationSignals` object so callers can source data from
> whatever layer is appropriate (oracle, indexer, or direct RPC).
