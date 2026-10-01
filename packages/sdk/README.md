# linkora-sdk

Typed TypeScript client for `LinkoraContract` on Stellar.

## Transaction retries: exponential backoff with jitter

`TransactionQueue` submits transactions through the Soroban RPC with a retry
policy designed to survive network congestion without making it worse. Instead
of fixed-interval retries — which cause every client to hit the network in
lockstep (a "thundering herd") — failed submissions are retried with
**exponential backoff and jitter**, bounded by a **circuit breaker**.

### Behavior

- **Exponential backoff** — the delay between retries grows as
  `baseDelayMs * 2^attempt`, capped at `maxDelayMs`.
- **Jitter** — a random `0 … jitterFactor * delay` is added to each delay so
  concurrent retriers spread out instead of retrying in sync.
- **Retry-After** — `429` (rate-limited) responses that carry a `Retry-After`
  header (delta-seconds or HTTP-date) are honored; that delay takes precedence
  over the computed backoff (still bounded by `maxDelayMs`).
- **Circuit breaker** — after `circuitBreakerThreshold` consecutive retryable
  failures the breaker opens, the queue is paused, and a `CircuitBreakerError`
  is thrown so callers can report the endpoint as unhealthy.
- **Permanent failures are not retried** — a submission the RPC rejects outright
  (`ERROR` status) fails fast rather than consuming retry budget.
- **Structured logging** — every retry decision is reported to an optional
  `logger` with the attempt number, delay, and reason
  (`error` | `rate-limited` | `circuit-open` | `exhausted`).

### Configuration

Retry tunables default to the environment, and can be overridden per queue.

| Environment variable                 | Default | Meaning                                        |
| ------------------------------------ | ------- | ---------------------------------------------- |
| `TX_RETRY_MAX_ATTEMPTS`              | `5`     | Max attempts (including the first) per submit  |
| `TX_RETRY_BASE_DELAY_MS`             | `1000`  | Base delay for the exponential term            |
| `TX_RETRY_MAX_DELAY_MS`              | `30000` | Upper bound on a single delay                  |
| `TX_RETRY_JITTER_FACTOR`             | `0.5`   | Jitter window as a fraction of the delay (0–1) |
| `TX_RETRY_CIRCUIT_BREAKER_THRESHOLD` | `5`     | Consecutive failures before the breaker opens  |

### Usage

```ts
import { TransactionQueue, ConnectionHealthMonitor } from "linkora-sdk";

const health = new ConnectionHealthMonitor(rpcUrl);

const queue = new TransactionQueue({
  signer,
  rpc,
  // Per-queue overrides (any omitted field falls back to the env defaults):
  retry: { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30000, jitterFactor: 0.5 },
  // Surface retry telemetry + circuit-breaker health through the monitor:
  logger: (info) => health.recordRetry(info),
});

queue.enqueue(xdr1).enqueue(xdr2);

try {
  await queue.run();
} catch (err) {
  if (queue.isCircuitOpen) {
    // Endpoint is unhealthy — back off before submitting more work.
  }
  throw err;
}
```

The lower-level primitives (`backoffWithJitter`, `CircuitBreaker`,
`parseRetryAfter`, `withRetry`) are exported directly for reuse.

### Dry-run status events

`TransactionQueue` emits status events via `queue.on("status", ...)`. When run
in **dry-run** mode (`run({ dryRun: true })` or a queue-level `dryRun: true`),
each step is simulated but never submitted. The queue still emits a `confirmed`
event at the end of each step to mark it complete, but that event:

- carries `dryRun: true`, and
- has **no** `hash` (nothing was broadcast).

Consumers listening for on-chain confirmations should check the `dryRun` flag to
avoid mistaking a simulated flow for a real submission:

```ts
queue.on("status", (e) => {
  if (e.status === "confirmed") {
    if (e.dryRun) {
      // Simulated — do not show as "submitted to network".
    } else {
      // Real confirmation — e.hash is present.
    }
  }
});
```

## Pagination

The SDK exposes three distinct pagination models depending on which layer you
are querying. Understanding each one is important for building correct,
duplicate-free UIs.

---

### 1. Contract reads — offset/limit

On-chain list queries (`getFollowers`, `getFollowing`, `getPostsByAuthor`) use
**integer offset/limit** pagination. The contract stores data in indexed
structures; you step through them by incrementing `offset` by the page size on
each call.

```ts
import { LinkoraClient } from "linkora-sdk";

const client = new LinkoraClient({ rpcUrl, contractId });

async function getAllFollowers(user: string): Promise<string[]> {
  const PAGE = 50;
  const all: string[] = [];
  let offset = 0;

  while (true) {
    const page = await client.getFollowers(user, offset, PAGE);
    all.push(...page);
    if (page.length < PAGE) break; // last page
    offset += PAGE;
  }

  return all;
}
```

**Notes:**

- `offset` is zero-based; the first page is `getFollowers(user, 0, 50)`.
- A page shorter than `limit` means you have reached the end. An empty array
  also terminates the loop.
- Concurrent writes can shift items between pages while you paginate (the same
  problem as SQL `OFFSET`). For display-only scenarios this is usually
  acceptable; for feeds that must be exactly correct, use the event stream
  instead (see section 3 below).

---

### 2. DM relay — cursor-based messages

The relay service returns messages with an opaque `next_cursor` string. Pass it
back verbatim on the next call to fetch the following page.

```ts
import { RelayClient } from "linkora-sdk";

const relay = new RelayClient({ baseUrl: "https://relay.example.com" });

async function loadFullConversation(conversationId: string): Promise<ConversationMessage[]> {
  const PAGE = 50;
  const messages: ConversationMessage[] = [];
  let cursor: string | undefined;

  do {
    const response = await relay.getMessages(conversationId, PAGE, cursor);
    messages.push(...response.messages);
    cursor = response.next_cursor;
  } while (response.has_more);

  return messages;
}
```

**How the cursor is encoded.** The relay encodes the cursor as a base64url
string containing the message timestamp and an opaque sequence tie-breaker
(`<unix_ms>:<seq>`), then base64url-encodes the result. You must treat it as an
opaque token — never parse or construct one manually. The encoding may change
between relay versions.

**Forward navigation** — follow `next_cursor` until `has_more` is `false`.

**Backward navigation** — the relay does not expose a `prev_cursor` today.
To implement "load earlier messages", keep the first cursor you received in
memory and pass it to a future `getMessages` call when the user scrolls up.
Because messages are append-only, this cursor remains valid indefinitely for the
same conversation.

---

### 3. Event stream — `pagingToken` / `LinkoraEventSubscriber`

Soroban events use `pagingToken` strings of the form `"<ledger_sequence>-<event_index>"`,
e.g. `"123456789-1"`. These tokens are issued by the Stellar RPC and are
globally ordered: a higher token always means a later event.

#### How `LinkoraEventSubscriber` uses cursors

The subscriber polls `getEvents` with a `pagination.cursor` field. After
processing each event it persists the event's `pagingToken` via a `CursorStore`
implementation so that a process restart can resume from exactly where it left
off — with no duplicates and no gaps.

```ts
import {
  LinkoraEventSubscriber,
  MemoryCursorStore,
  LocalStorageCursorStore,
  FileCursorStore,
  createDefaultCursorStore,
} from "linkora-sdk";

// Pick a store that matches your runtime:
//   MemoryCursorStore    — in-process only; resets on restart
//   LocalStorageCursorStore — browser; survives page refresh
//   FileCursorStore      — Node.js server; survives process restart
//   createDefaultCursorStore() — auto-selects based on environment

const store = new FileCursorStore("./.linkora-cursor");

const subscriber = new LinkoraEventSubscriber({
  rpcUrl: "https://soroban-testnet.stellar.org",
  contractId: "C...",
  cursorStore: store,
  pageLimit: 100, // events per poll (default 100)
  minPollIntervalMs: 500, // fastest poll cadence
  maxPollIntervalMs: 10_000, // slowest poll cadence during idle
});

subscriber.subscribe({
  post_created: (event) => {
    console.log(`Post ${event.id} by ${event.author} at ledger ${event.meta.ledger}`);
  },
  tip: (event) => {
    console.log(`Tip of ${event.amount} stroops on post ${event.post_id}`);
  },
});

await subscriber.start();
```

#### Full paginated loop (manual / batch use)

For one-shot backfills — e.g. an indexer catching up from a known ledger — you
can drive the Stellar RPC directly without the subscriber:

```ts
import { createDefaultCursorStore } from "linkora-sdk";

interface SorobanRpcEvent {
  id?: string;
  pagingToken?: string;
  // …other fields
}

interface GetEventsResult {
  events: SorobanRpcEvent[];
}

async function backfillEvents(
  rpcUrl: string,
  contractId: string,
  startLedger: number
): Promise<void> {
  const store = createDefaultCursorStore();
  let cursor = await store.get();
  const PAGE = 200;

  while (true) {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getEvents",
      params: {
        startLedger,
        filters: [{ type: "contract", contractIds: [contractId] }],
        pagination: {
          limit: PAGE,
          ...(cursor ? { cursor } : {}),
        },
      },
    };

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { result?: GetEventsResult };
    const events = json.result?.events ?? [];

    for (const event of events) {
      // process event …
      if (event.pagingToken) {
        cursor = event.pagingToken;
        await store.set(event.pagingToken);
      }
    }

    // Fewer events than requested → we have caught up to the chain tip.
    if (events.length < PAGE) break;
  }
}
```

#### Cursor encoding

A `pagingToken` has the format `"<ledger_sequence>-<event_index_within_ledger>"`:

| Token           | Meaning                         |
| --------------- | ------------------------------- |
| `"123456789-0"` | First event in ledger 123456789 |
| `"123456789-4"` | Fifth event in that same ledger |
| `"123456790-0"` | First event in the next ledger  |

Tokens are **lexicographically comparable** when ledger sequences are
zero-padded to the same length, but because the Stellar RPC sorts by numeric
value, you should never rely on string ordering. Always treat them as opaque
strings and let the RPC handle ordering.

#### Forward navigation

Pass the last `pagingToken` you processed as `pagination.cursor`. The RPC
returns the next batch of events that occurred **after** that cursor.

#### Backward navigation

The Stellar RPC `getEvents` endpoint does not support reverse ordering today. To
implement "load older events" in a UI, fetch events forward from `startLedger`
and keep them in a local buffer. For production feeds, store events in a
database (e.g. via the indexer service) and query backwards with SQL
`ORDER BY ledger DESC`.

---

### Deduplication

Even with a persisted cursor, duplicates can appear in two edge cases:

1. **Crash between processing and persisting.** If your process handles an event
   but crashes before calling `store.set(pagingToken)`, the next run will
   re-deliver that event. **Mitigation:** commit the cursor in the same
   transaction as the side-effect it triggers (database row, message queue ACK,
   etc.), or make your handler idempotent.

2. **Page boundary overlap.** The `pagingToken` saved after processing the last
   event in a page is exclusive — the next `getEvents` call starts strictly
   after it. There is no off-by-one overlap at the boundary.

For contract read pagination (`getFollowers` / `getPostsByAuthor`), duplicates
can appear if items are added between pages. Collect all pages into a `Set`
keyed by the item identity (address or post ID) before presenting to users.

---

### Cursor invalidation

| Scenario                               | What happens                                                                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ledger too old**                     | If `startLedger` is older than the RPC node's history window (typically 7 days on Mainnet), the call fails with an `RPC error`. Start from `startLedger: 0` (latest) or from a ledger within the window.                                |
| **`pagingToken` from a pruned ledger** | A cursor pointing to a ledger that has been pruned returns no events and the subscriber silently catches up from the oldest available ledger. Persist cursors and refresh the history window to avoid this.                             |
| **Contract redeployment / upgrade**    | Contract ID never changes on an upgrade, so existing cursors remain valid. If the contract is migrated to a new ID, all cursors are invalidated and you must restart from `startLedger: 0`.                                             |
| **Relay restart / schema migration**   | Relay cursors are opaque server-side tokens. A relay restart may invalidate open cursors; `has_more: false` will be returned for stale cursors. Always handle the case where `next_cursor` is absent even when you expect more results. |

---

## API Semantics

The SDK exposes two distinct paths for mutative (write) operations:

### 1. `prepare*Tx` (Submittable)

Methods like `prepareCreatePostTx`, `prepareFollowTx`, and `prepareDmKeyTx` are the **intended path for client-side applications**.
They fetch the actual account sequence from Horizon, simulate the transaction to discover footprint/fees, and return a base64-encoded `TransactionEnvelope` XDR that is fully ready to be signed (e.g. by Freighter) and submitted to the network.

```ts
const txXdr = await client.prepareCreatePostTx("GBFOY...", "Hello!");
// txXdr is ready to be passed to wallet for signing
```

### 2. Base Write Methods (Throwaway XDR)

Methods like `createPost`, `follow`, and `tip` **do not fetch sequence numbers** and return XDR built using a throwaway `Keypair`.
**These are not directly submittable.** They exist primarily to easily extract the Soroban `Operation` for batching (e.g., passing to `buildMultiOpTx`) or for server-side queueing where sequence management is handled by a background worker (like `TransactionQueue`).

If you attempt to sign and submit this XDR directly, the network will reject it with a `tx_bad_seq` error.

---

## TipClient

Tipping operations are exposed directly on `LinkoraClient`. The protocol charges a fee in basis points (bps) on every tip, deducted from the tip amount before the remainder reaches the post author.

### Methods

| Method                                                     | Type                  | Description                                                |
| ---------------------------------------------------------- | --------------------- | ---------------------------------------------------------- |
| `tip(tipper, postId, token, amount)`                       | Write (throwaway XDR) | Builds a `tip` operation XDR                               |
| `prepareTipTx(tipper, postId, token, amount, horizonUrl?)` | Write (submittable)   | Fetches real sequence, simulates, returns wallet-ready XDR |
| `getFeeBps()`                                              | Read                  | Returns the current protocol fee in basis points           |
| `setFee(feeBps)`                                           | Write (throwaway XDR) | Admin: set the protocol fee (e.g. `150` = 1.5%)            |
| `getTipCooldownWindow()`                                   | Read                  | Returns the tip cooldown in ledgers                        |
| `setTipCooldownWindow(cooldownLedgers)`                    | Write (throwaway XDR) | Admin: set the tip cooldown window                         |

> **Note:** The SDK does not expose a `getTipTotals` method — cumulative tip totals per post are maintained by the indexer in the `posts.tip_total` column and returned in feed and search responses. Query them via the indexer's search or feed endpoints.

### Fee split explanation

When a user tips `amount` stroops of `token`:

1. The contract reads the current `feeBps` (settable by admin via `setFee`).
2. Protocol fee = `floor(amount × feeBps / 10000)`.
3. The protocol fee is transferred to the `treasury` address.
4. The remaining `amount − fee` is credited to the post author.

```
tip amount = 1,000,000 stroops
feeBps     = 200 (2%)
fee        = 20,000 stroops → treasury
payout     = 980,000 stroops → post author
```

A `feeBps` of `0` means no fee is charged.

### getTipTotals — time-range parameters

Cumulative tip totals are available from the indexer. The `/api/search` endpoint and `/api/feed` responses include a `tip_total` field per post (sum of all tip payouts since the post was indexed).

For time-range breakdowns, query the `tips` table directly or use the indexer search endpoint with the `from` / `to` date parameters:

| Parameter | Type                 | Description                          |
| --------- | -------------------- | ------------------------------------ |
| `from`    | ISO 8601 date string | Start of the time window (inclusive) |
| `to`      | ISO 8601 date string | End of the time window (inclusive)   |

```bash
# Tips received on a post within a date range
GET /api/search?q=&from=2024-01-01&to=2024-12-31
```

### Examples

#### sendTip — throwaway XDR (server-side queue)

```ts
import { LinkoraClient } from "linkora-sdk";

const client = new LinkoraClient({
  contractId: "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  rpcUrl: "https://soroban-testnet.stellar.org",
});

// Tip the author of post #42 with 5 XLM (50,000,000 stroops)
const opXdr = client.tip(
  "GBFOY...", // tipper
  42n, // postId
  "CTOKEN...", // token contract address (e.g. XLM wrapped SEP-41)
  50_000_000n // amount in stroops
);
console.log("Tip Op XDR:", opXdr);
```

#### prepareTipTx — wallet-ready transaction

```ts
const txXdr = await client.prepareTipTx(
  "GBFOY...", // tipper
  42n, // postId
  "CTOKEN...", // token contract address
  50_000_000n // amount in stroops
);
// Pass txXdr to Freighter or another Stellar wallet for signing
```

#### Check current fee and simulate net payout

```ts
const feeBps = await client.getFeeBps(); // e.g. 200
const amount = 50_000_000n;
const fee = (amount * BigInt(feeBps)) / 10_000n;
const payout = amount - fee;
console.log(`Fee: ${fee} stroops, Creator receives: ${payout} stroops`);
```

#### Query tip totals for a post from the indexer

```ts
const response = await fetch("https://indexer.linkora.example/api/feed?limit=1&viewer=GBFOY...");
const { posts } = await response.json();
const post = posts[0];
console.log(`Post #${post.id} has received ${post.tip_total} stroops in tips`);
```
