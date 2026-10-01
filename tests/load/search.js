/**
 * k6 load test — Search service
 *
 * Issue: #283
 *
 * Scenario
 * --------
 * Simulates 100 concurrent users performing a 5-minute ramp over the Linkora
 * indexer search / query API (port 3000).  The test exercises the most common
 * read paths: profile lookup, post listing, follow-graph traversal, and pool
 * queries — all of which share the same PostgreSQL full-text search layer.
 *
 * Acceptance criteria
 * -------------------
 * - P95 response time < 200 ms                        (threshold: p(95)<200)
 * - HTTP error rate < 1 %                             (threshold: rate<0.01)
 * - Results are uploaded as a CI artifact (non-blocking)
 *
 * Running locally
 * ---------------
 *   docker compose up -d
 *   k6 run tests/load/search.js
 *
 * Override the target with an environment variable:
 *   k6 run -e BASE_URL=http://localhost:3000 tests/load/search.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API = `${BASE_URL}/api`;

/** Custom metrics */
const searchLatency = new Trend("search_latency_ms", true);
const searchErrors = new Rate("search_errors");

// ---------------------------------------------------------------------------
// k6 options
// ---------------------------------------------------------------------------

export const options = {
  scenarios: {
    search_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        // Ramp to 100 concurrent users over 5 minutes
        { target: 100, duration: "5m" },
        // Hold at 100 VUs for 0 s (test ends immediately after ramp)
        { target: 100, duration: "0s" },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    // P95 response time must stay below 200 ms
    search_latency_ms: ["p(95)<200"],
    // HTTP error rate must stay below 1 %
    http_req_failed: ["rate<0.01"],
    search_errors: ["rate<0.01"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

// ---------------------------------------------------------------------------
  Linkora Indexer — Search Load Test Results
  Total requests : ${totalReqs}
  Error rate     : ${errorRate}%
  Avg latency    : ${avg} ms
  P95 latency    : ${p95} ms  ${p95Status} (target: < 200 ms)
  P99 latency    : ${p99} ms
  Results saved to tests/load/results.json
`;
}
// Seed data — representative Stellar-format addresses and IDs
// ---------------------------------------------------------------------------

// Synthetic Stellar G-addresses used as path parameters.  In a real run these
// would be seeded from the database; here we use fixed values that exercise
// the routing and SQL layers without requiring a live chain.
const ADDRESSES = [
  "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
  "GBCVKDMCPZF5ZIQVKKRM2MFBFJBMNMK3HMNE4IPJEXDFZUHVEMKHBJ6",
  "GDQNY3PBOJOKYZSRMK2S7LHHGWZIUISD4QORETLMXEWXBI7KFZZMKTL",
  "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  "GAXCY3NDVNJWTXHBXQVKZG6YIGTYFVJRPZJY5BBLXKZV4KKMB5JKQH",
  "GDYULVJK2T6G7HFUC76LIBKZEMXPKGINSG6566EPWJKCLXTYVWJ7XUY",
  "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZWJTUQJHWC2TD3K3H2T7",
  "GC3GZYNFWCJPV5NTXJQMFNFVGV2V6P5DCFYHFLXAQEXQBNXEGAHE4LQ",
];

const POST_IDS = ["1", "2", "3", "4", "5", "10", "20", "50", "100"];
const POOL_IDS = ["LINK", "CREATOR", "SOCIAL", "DEFI"];

/** Pick a random item from an array */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

const HEADERS = { Accept: "application/json" };

function getProfile() {
  const addr = pick(ADDRESSES);
  const start = Date.now();
  const res = http.get(`${API}/profiles/${addr}`, {
    headers: HEADERS,
    tags: { endpoint: "profile" },
  });
  searchLatency.add(Date.now() - start);
  searchErrors.add(res.status >= 400 && res.status !== 404);
  check(res, {
    "profile: status ok or 404": (r) => r.status === 200 || r.status === 404,
  });
}

function listPosts() {
  const addr = pick(ADDRESSES);
  const limit = pick([10, 20, 50]);
  const start = Date.now();
  const res = http.get(`${API}/posts?author=${addr}&limit=${limit}`, {
    headers: HEADERS,
    tags: { endpoint: "posts_list" },
  });
  searchLatency.add(Date.now() - start);
  searchErrors.add(res.status >= 400);
  check(res, {
    "posts list: status 200": (r) => r.status === 200,
    "posts list: JSON array": (r) => {
      try {
        const b = JSON.parse(r.body);
        return Array.isArray(b.posts || b);
      } catch (_) {
        return false;
      }
    },
  });
}

function getPost() {
  const id = pick(POST_IDS);
  const start = Date.now();
  const res = http.get(`${API}/posts/${id}`, {
    headers: HEADERS,
    tags: { endpoint: "post_by_id" },
  });
  searchLatency.add(Date.now() - start);
  searchErrors.add(res.status >= 400 && res.status !== 404);
  check(res, {
    "post: status ok or 404": (r) => r.status === 200 || r.status === 404,
  });
}

function getFollowers() {
  const addr = pick(ADDRESSES);
  const start = Date.now();
  const res = http.get(`${API}/follows/${addr}/followers?limit=20`, {
    headers: HEADERS,
    tags: { endpoint: "followers" },
  });
  searchLatency.add(Date.now() - start);
  searchErrors.add(res.status >= 400 && res.status !== 404);
  check(res, {
    "followers: status ok or 404": (r) => r.status === 200 || r.status === 404,
  });
}

function getFollowing() {
  const addr = pick(ADDRESSES);
  const start = Date.now();
  const res = http.get(`${API}/follows/${addr}/following?limit=20`, {
    headers: HEADERS,
    tags: { endpoint: "following" },
  });
  searchLatency.add(Date.now() - start);
  searchErrors.add(res.status >= 400 && res.status !== 404);
  check(res, {
    "following: status ok or 404": (r) => r.status === 200 || r.status === 404,
  });
}

function getPool() {
  const id = pick(POOL_IDS);
  const start = Date.now();
  const res = http.get(`${API}/pools/${id}`, {
    headers: HEADERS,
    tags: { endpoint: "pool" },
  });
  searchLatency.add(Date.now() - start);
  searchErrors.add(res.status >= 400 && res.status !== 404);
  check(res, {
    "pool: status ok or 404": (r) => r.status === 200 || r.status === 404,
  });
}

// ---------------------------------------------------------------------------
// Weighted request mix — mirrors typical production traffic distribution
// ---------------------------------------------------------------------------
//
//   40% post list queries  (heaviest full-text search path)
//   25% profile lookups
//   15% follower graph queries
//   10% following graph queries
//    5% single post fetch
//    5% pool queries

const ACTIONS = [
  ...Array(40).fill(listPosts),
  ...Array(25).fill(getProfile),
  ...Array(15).fill(getFollowers),
  ...Array(10).fill(getFollowing),
  ...Array(5).fill(getPost),
  ...Array(5).fill(getPool),
];

// ---------------------------------------------------------------------------
// Default function
// ---------------------------------------------------------------------------

export default function () {
  // Pick a request type according to the weighted distribution
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  action();

  // Realistic think-time between requests (50–150 ms)
  sleep(0.05 + Math.random() * 0.1);
}

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

export function setup() {
  const res = http.get(`${BASE_URL}/health/ready`);
  if (res.status !== 200) {
    console.warn(
      `[setup] indexer health check returned ${res.status}. ` +
        "The service may not be running — results may be unreliable."
    );
  }
  return { baseUrl: BASE_URL };
}

export function handleSummary(data) {
  return {
    stdout: JSON.stringify(data, null, 2),
    "tests/load/results/search-summary.json": JSON.stringify(data, null, 2),
  };
}
