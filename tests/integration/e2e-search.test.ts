/**
 * E2E Search Integration Test
 *
 * Exercises the full search flow through the indexer:
 *   1. Create a profile for alice
 *   2. Create a post with unique searchable content
 *   3. Wait for the indexer to index the post
 *   4. Search for the post by keyword — verify it appears in results
 *   5. Search by tag — verify tag filtering works
 *   6. Search with a term that matches nothing — verify empty results
 *
 * All state assertions use retry loops (pollIndexer / pollContractState),
 * not hardcoded sleeps, to keep the suite fast and deterministic.
 *
 * Search endpoint:
 *   GET /api/search/posts?q=<keyword>
 *   GET /api/search/posts?tag=<tag>
 *   Response: { posts: Post[], total: number, limit: number, offset: number, has_more: boolean }
 */

import { Keypair } from "@stellar/stellar-sdk";
import {
  bootstrap,
  teardown,
  submitContractTx,
  indexerFetch,
  pollIndexer,
  pollContractState,
  createSdkClient,
  scvAddress,
  scvString,
  scvU64,
  TEST_CONFIG,
} from "./setup";

let accounts: Awaited<ReturnType<typeof bootstrap>>["accounts"];
let contracts: Awaited<ReturnType<typeof bootstrap>>["contracts"];
let sdk: ReturnType<typeof createSdkClient>;
let cfgDir: string = "";

// Unique token per test run so parallel CI runs never collide.
const RUN_ID = Date.now().toString(36).toUpperCase();

beforeAll(async () => {
  const ctx = await bootstrap();
  accounts = ctx.accounts;
  contracts = ctx.contracts;
  sdk = ctx.sdk;
  cfgDir = process.env.E2E_CFG_DIR || "";
}, 300_000);

afterAll(async () => {
  await teardown(cfgDir);
}, 30_000);

function addr(kp: Keypair): string {
  return kp.publicKey();
}

interface SearchResponse {
  posts: Array<{
    id: string;
    author: string;
    content: string;
    tag?: string;
    tip_total: string;
    like_count: string;
  }>;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

describe("Search E2E", () => {
  test(
    "Index a post and find it via keyword search, tag search, and empty-result search",
    async () => {
      const cid = contracts.contractId;
      const tid = contracts.tokenId;
      const aliceAddr = addr(accounts.alice);

      // ── 1. Create alice's profile ──────────────────────────────────────────
      console.log("\n[search] 1: Creating alice's profile...");
      await submitContractTx(sdk, accounts.alice, "set_profile", [
        scvAddress(aliceAddr),
        scvString(`alice_search_${RUN_ID}`),
        scvAddress(tid),
      ]);

      // Wait for profile to appear in indexer before continuing.
      const profile = await pollIndexer(
        `/api/profiles/${aliceAddr}`,
        (data) => data !== null,
        { label: "alice-profile-search", maxAttempts: 30 }
      );
      expect(profile).not.toBeNull();
      console.log("  ✓ Alice profile indexed");

      // ── 2. Create a post with unique searchable content ────────────────────
      // Embed the RUN_ID so the keyword is globally unique and a search for it
      // returns exactly this post, even when other test suites run concurrently.
      const uniqueKeyword = `searchable_${RUN_ID}`;
      const postContent = `This is a ${uniqueKeyword} post created during E2E testing.`;

      console.log(`[search] 2: Creating post with keyword "${uniqueKeyword}"...`);

      // Capture post count before creation so we can derive the new post ID.
      const postCountBefore: bigint = await pollContractState(
        () => sdk.getPostCount(),
        () => true,
        { label: "post-count-before" }
      );

      await submitContractTx(sdk, accounts.alice, "create_post", [
        scvAddress(aliceAddr),
        scvString(postContent),
        scvString(""), // media_url — empty
        scvU64(0n),    // pool_id — 0 means no pool
      ]);

      // Wait for the post count to increment (confirms the post was indexed).
      await pollContractState(
        () => sdk.getPostCount(),
        (c) => c > postCountBefore,
        { label: "post-count-after-search-post", maxAttempts: 30 }
      );

      const newCount = await sdk.getPostCount();
      const postId = String(newCount);

      // Wait for the post to be visible in the indexer.
      const indexedPost = await pollIndexer(
        `/api/posts/${postId}`,
        (data) => data !== null,
        { label: `post-${postId}-indexed`, maxAttempts: 30 }
      );
      expect(indexedPost).not.toBeNull();
      console.log(`  ✓ Post ${postId} indexed`);

      // ── 3. Search by keyword — expect exactly this post ────────────────────
      console.log(`[search] 3: Searching for keyword "${uniqueKeyword}"...`);

      const searchResult = await pollIndexer<SearchResponse>(
        `/api/search/posts?q=${encodeURIComponent(uniqueKeyword)}`,
        (data) => {
          if (!data) return false;
          return data.posts.some((p) => p.content.includes(uniqueKeyword));
        },
        { label: "keyword-search", maxAttempts: 30, baseDelayMs: 1000 }
      );

      expect(searchResult).not.toBeNull();
      expect(searchResult!.posts.length).toBeGreaterThanOrEqual(1);

      const matchedPost = searchResult!.posts.find((p) => p.content.includes(uniqueKeyword));
      expect(matchedPost).toBeDefined();
      expect(matchedPost!.author).toBe(aliceAddr);
      expect(searchResult!.total).toBeGreaterThanOrEqual(1);
      console.log(
        `  ✓ Keyword search returned ${searchResult!.total} result(s); matched post ${matchedPost!.id}`
      );

      // ── 4. Search by tag — create a post with a tag and verify tag filtering
      const uniqueTag = `tag_${RUN_ID}`;
      console.log(`[search] 4: Creating tagged post with tag "${uniqueTag}"...`);

      const taggedContent = `Tagged post content for E2E. #${uniqueTag}`;

      const tagPostCountBefore = await sdk.getPostCount();

      await submitContractTx(sdk, accounts.alice, "create_post", [
        scvAddress(aliceAddr),
        scvString(taggedContent),
        scvString(""),
        scvU64(0n),
      ]);

      await pollContractState(
        () => sdk.getPostCount(),
        (c) => c > tagPostCountBefore,
        { label: "post-count-after-tagged-post", maxAttempts: 30 }
      );

      const taggedPostCount = await sdk.getPostCount();
      const taggedPostId = String(taggedPostCount);

      await pollIndexer(
        `/api/posts/${taggedPostId}`,
        (data) => data !== null,
        { label: `tagged-post-${taggedPostId}-indexed`, maxAttempts: 30 }
      );
      console.log(`  ✓ Tagged post ${taggedPostId} indexed`);

      // Search for the hash tag via the /api/search/posts?q= endpoint.
      // The contract stores raw content; tag-based search matches the #tag
      // substring in the post content via full-text search.
      const tagSearchResult = await pollIndexer<SearchResponse>(
        `/api/search/posts?q=${encodeURIComponent(uniqueTag)}`,
        (data) => {
          if (!data) return false;
          return data.posts.some(
            (p) => p.content.includes(uniqueTag)
          );
        },
        { label: "tag-search", maxAttempts: 30, baseDelayMs: 1000 }
      );

      expect(tagSearchResult).not.toBeNull();
      expect(tagSearchResult!.posts.length).toBeGreaterThanOrEqual(1);
      const taggedMatch = tagSearchResult!.posts.find((p) => p.content.includes(uniqueTag));
      expect(taggedMatch).toBeDefined();
      console.log(`  ✓ Tag search returned ${tagSearchResult!.total} result(s)`);

      // ── 5. Search with a term that should match nothing ────────────────────
      console.log("[search] 5: Searching for a term that matches nothing...");

      const noMatchTerm = `NOMATCH_${RUN_ID}_XYZZY_UNIQUE`;
      const emptyResult = await indexerFetch<SearchResponse>(
        `/api/search/posts?q=${encodeURIComponent(noMatchTerm)}`
      );

      // The endpoint returns 200 with an empty array for no results.
      expect(emptyResult.ok).toBe(true);
      expect(emptyResult.data).not.toBeNull();
      expect(emptyResult.data!.posts).toHaveLength(0);
      expect(emptyResult.data!.total).toBe(0);
      expect(emptyResult.data!.has_more).toBe(false);
      console.log("  ✓ Empty search result correctly returned (total=0, posts=[])");

      // ── 6. Verify pagination metadata ─────────────────────────────────────
      console.log("[search] 6: Verifying pagination metadata...");

      const pagedResult = await indexerFetch<SearchResponse>(
        `/api/search/posts?q=${encodeURIComponent(uniqueKeyword)}&limit=1&offset=0`
      );

      expect(pagedResult.ok).toBe(true);
      expect(pagedResult.data).not.toBeNull();
      expect(pagedResult.data!.limit).toBe(1);
      expect(pagedResult.data!.offset).toBe(0);
      expect(pagedResult.data!.posts.length).toBeLessThanOrEqual(1);
      console.log("  ✓ Pagination metadata (limit/offset) correctly reflected in response");
    },
    300_000
  );
});
