/**
 * E2E Notifications Test
 *
 * Covers notification dispatch end-to-end:
 *   1. Create two user profiles (Alice and Bob)
 *   2. Alice follows Bob — triggers a follow event on-chain
 *   3. Assert that an in-app notification is created for Bob
 *   4. Verify the push-dispatch was called with the correct payload
 *
 * All state assertions use retry loops (pollContractState / pollForProfile),
 * never hardcoded sleeps.
 *
 * Run via: bash tests/integration/run_e2e.sh
 */

import {
  bootstrap,
  teardown,
  submitContractTx,
  pollForProfile,
  pollContractState,
  indexerFetch,
  createSdkClient,
  scvAddress,
  scvString,
  TEST_CONFIG,
} from "./setup";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let accounts: Awaited<ReturnType<typeof bootstrap>>["accounts"];
let contracts: Awaited<ReturnType<typeof bootstrap>>["contracts"];
let sdk: ReturnType<typeof createSdkClient>;
let cfgDir: string = "";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const ctx = await bootstrap();
  accounts = ctx.accounts;
  contracts = ctx.contracts;
  sdk = ctx.sdk;
  cfgDir = process.env.E2E_CFG_DIR ?? "";
}, 300_000);

afterAll(async () => {
  await teardown(cfgDir);
}, 30_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addr(kp: { publicKey(): string }): string {
  return kp.publicKey();
}

/**
 * Minimal shape returned by the notification service / indexer endpoint.
 * Only the fields relevant to these tests are typed; others fall through as
 * `unknown`.
 */
interface NotificationRecord {
  id: string;
  recipient: string;
  type: string;
  actor?: string;
  read: boolean;
  created_at: string;
  payload?: Record<string, unknown>;
}

interface NotificationListResponse {
  notifications: NotificationRecord[];
  total: number;
}

/**
 * Shape returned by the push-dispatch audit endpoint.
 * Represents the last dispatch attempt recorded by the notification service.
 */
interface PushDispatchRecord {
  recipient: string;
  type: string;
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  };
  dispatched_at: string;
}

interface PushDispatchResponse {
  dispatches: PushDispatchRecord[];
  total: number;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Notifications E2E", () => {
  test(
    "Follow event triggers in-app notification and push dispatch with correct payload",
    async () => {
      const aliceAddr = addr(accounts.alice);
      const bobAddr = addr(accounts.bob);

      // ── 1. Create profiles ────────────────────────────────────────────────
      console.log("\n[notifications] 1: Creating profiles...");

      await submitContractTx(sdk, accounts.alice, "set_profile", [
        scvAddress(aliceAddr),
        scvString("alice_notify"),
        scvAddress(contracts.tokenId),
      ]);

      await submitContractTx(sdk, accounts.bob, "set_profile", [
        scvAddress(bobAddr),
        scvString("bob_notify"),
        scvAddress(contracts.tokenId),
      ]);

      await pollForProfile(aliceAddr);
      await pollForProfile(bobAddr);
      console.log("  ✓ Both profiles confirmed");

      // ── 2. Alice follows Bob ──────────────────────────────────────────────
      console.log("[notifications] 2: Alice follows Bob...");

      await submitContractTx(sdk, accounts.alice, "follow", [
        scvAddress(aliceAddr),
        scvAddress(bobAddr),
      ]);

      // Confirm the follow landed on-chain before checking notifications.
      await pollContractState(
        () => sdk.getFollowing(aliceAddr, 0, 10),
        (list) => list.includes(bobAddr),
        { label: "alice-follows-bob", maxAttempts: 20 },
      );
      console.log("  ✓ Follow confirmed on-chain");

      // ── 3. Assert in-app notification created for Bob ─────────────────────
      console.log(
        "[notifications] 3: Waiting for in-app notification on Bob's feed...",
      );

      const notifResponse = await pollContractState(
        () =>
          indexerFetch<NotificationListResponse>(
            `/api/notifications/${bobAddr}?limit=20`,
          ),
        (resp) => {
          if (!resp.data?.notifications) return false;
          return resp.data.notifications.some(
            (n) =>
              n.type === "follow" &&
              (n.actor === aliceAddr || n.payload?.actor === aliceAddr),
          );
        },
        { label: "bob-follow-notification", maxAttempts: 30 },
      );

      const followNotif = notifResponse.data!.notifications.find(
        (n) =>
          n.type === "follow" &&
          (n.actor === aliceAddr || n.payload?.actor === aliceAddr),
      )!;

      expect(followNotif).toBeDefined();
      expect(followNotif.recipient).toBe(bobAddr);
      expect(followNotif.type).toBe("follow");
      expect(followNotif.read).toBe(false);
      console.log(`  ✓ In-app notification created (id=${followNotif.id})`);

      // ── 4. Verify push dispatch was called with correct payload ───────────
      console.log(
        "[notifications] 4: Verifying push dispatch payload for Bob...",
      );

      const pushResponse = await pollContractState(
        () =>
          indexerFetch<PushDispatchResponse>(
            `/api/notifications/push-log/${bobAddr}?limit=20`,
          ),
        (resp) => {
          if (!resp.data?.dispatches) return false;
          return resp.data.dispatches.some(
            (d) =>
              d.type === "follow" &&
              d.recipient === bobAddr,
          );
        },
        { label: "bob-push-dispatch", maxAttempts: 30 },
      );

      const pushRecord = pushResponse.data!.dispatches.find(
        (d) => d.type === "follow" && d.recipient === bobAddr,
      )!;

      expect(pushRecord).toBeDefined();
      expect(pushRecord.recipient).toBe(bobAddr);
      expect(pushRecord.type).toBe("follow");
      expect(typeof pushRecord.payload.title).toBe("string");
      expect(pushRecord.payload.title.length).toBeGreaterThan(0);
      expect(typeof pushRecord.payload.body).toBe("string");
      expect(pushRecord.payload.body.length).toBeGreaterThan(0);

      console.log(
        `  ✓ Push dispatch verified — title: "${pushRecord.payload.title}"`,
      );
    },
    180_000,
  );

  test(
    "Notification is marked as read after recipient acknowledges it",
    async () => {
      const bobAddr = addr(accounts.bob);

      // Poll until Bob has at least one notification (carried over from
      // previous test in the same describe block).
      const listResp = await pollContractState(
        () =>
          indexerFetch<NotificationListResponse>(
            `/api/notifications/${bobAddr}?limit=20`,
          ),
        (resp) => (resp.data?.total ?? 0) > 0,
        { label: "bob-has-notifications", maxAttempts: 20 },
      );

      const notifId = listResp.data!.notifications[0]!.id;
      expect(notifId).toBeTruthy();

      // Mark as read via the notification service.
      const markReadResp = await fetch(
        `${TEST_CONFIG.indexerUrl}/api/notifications/${bobAddr}/${notifId}/read`,
        { method: "POST" },
      );
      expect(markReadResp.status).toBe(200);
      console.log(`  ✓ Mark-as-read request accepted (id=${notifId})`);

      // Verify the updated read flag is reflected.
      await pollContractState(
        () =>
          indexerFetch<NotificationListResponse>(
            `/api/notifications/${bobAddr}?limit=20`,
          ),
        (resp) => {
          const n = resp.data?.notifications.find((x) => x.id === notifId);
          return n?.read === true;
        },
        { label: "notification-marked-read", maxAttempts: 15 },
      );
      console.log("  ✓ Notification confirmed as read");
    },
    120_000,
  );
});
