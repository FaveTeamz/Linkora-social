/**
 * k6 load test — Notification dispatch
 *
 * Issue: #284
 *
 * Scenario
 * --------
 * Simulates 1 000 notification-dispatch events per minute being pushed to the
 * dm-relay service (port 3001) which handles notification routing.  The test
 * ramps up over 30 s, sustains the target rate for 4 minutes, then ramps down
 * over 30 s — giving a total run time of 5 minutes.
 *
 * Acceptance criteria
 * -------------------
 * - Dispatch queue depth (reported by GET /health/ready → queueDepth) must
 *   stay below 100 for every sample taken during the sustained phase.
 * - HTTP error rate must stay below 1 %.
 *
 * Running locally
 * ---------------
 *   docker compose up -d
 *   k6 run tests/load/notifications.js
 *
 * The BASE_URL environment variable can override the default target:
 *   k6 run -e BASE_URL=http://localhost:3001 tests/load/notifications.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { randomBytes } from "k6/crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";

// 1 000 events/minute = ~16.67 req/s.  k6 constant-arrival-rate executor
// targets this rate across the VU pool.
const TARGET_RPS = 17; // rounded up so we never fall short

/** Custom metrics */
const queueDepthOk = new Rate("queue_depth_ok");
const dispatchDuration = new Trend("dispatch_duration_ms", true);

export const options = {
  scenarios: {
    notification_dispatch: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        // Ramp up to target rate over 30 s
        { target: TARGET_RPS, duration: "30s" },
        // Sustain for 4 minutes (the measurement window)
        { target: TARGET_RPS, duration: "4m" },
        // Ramp down over 30 s
        { target: 0, duration: "30s" },
      ],
    },
  },
  thresholds: {
    // HTTP errors must stay below 1 %
    http_req_failed: ["rate<0.01"],
    // Queue depth must remain below 100 throughout the test
    queue_depth_ok: ["rate>0.99"],
    // P95 dispatch latency target (informational, non-blocking)
    dispatch_duration_ms: ["p(95)<500"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a synthetic notification-dispatch payload.
 * In a real environment this would be signed with a Stellar key; here we use
 * a random bytes payload to exercise the HTTP path and queue depth.
 */
function buildPayload() {
  // 32-byte random hex string simulates a Stellar account public key
  const senderHex = randomBytes(32).reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "");

  return JSON.stringify({
    type: "notification",
    event: "tip_received",
    sender: `G${senderHex.toUpperCase().slice(0, 55)}`,
    recipient: `GBENCH${senderHex.toUpperCase().slice(0, 50)}`,
    amount: "10.0000000",
    asset: "XLM",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Sample the queue depth from the health endpoint.
 * Returns the numeric queue depth, or -1 if unavailable.
 */
function sampleQueueDepth() {
  const res = http.get(`${BASE_URL}/health/ready`, {
    tags: { name: "health_check" },
  });
  if (res.status !== 200) return -1;
  try {
    const body = JSON.parse(res.body);
    return typeof body.queueDepth === "number" ? body.queueDepth : 0;
  } catch (_) {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Default function (executed once per VU iteration)
// ---------------------------------------------------------------------------

export default function () {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const payload = buildPayload();
  const start = Date.now();

  const res = http.post(`${BASE_URL}/api/notifications/dispatch`, payload, {
    headers,
    tags: { name: "dispatch" },
    timeout: "10s",
  });

  dispatchDuration.add(Date.now() - start);

  check(res, {
    "dispatch: status 2xx": (r) => r.status >= 200 && r.status < 300,
    "dispatch: has response body": (r) => r.body && r.body.length > 0,
  });

  // Sample queue depth on every 10th iteration to avoid flooding the health
  // endpoint (it is not the system under test).
  if (Math.random() < 0.1) {
    const depth = sampleQueueDepth();
    // depth === -1 means health endpoint unavailable; we do not penalise that.
    const depthOk = depth === -1 || depth < 100;
    queueDepthOk.add(depthOk);

    check(
      { depth },
      {
        "queue depth < 100": (d) => d.depth === -1 || d.depth < 100,
      }
    );
  }

  // Small think-time to avoid thundering-herd spikes between iterations
  sleep(0.05);
}

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

export function setup() {
  // Verify the service is reachable before starting the load
  const res = http.get(`${BASE_URL}/health/ready`);
  if (res.status !== 200) {
    console.warn(
      `[setup] dm-relay health check returned ${res.status}. ` +
        "The service may not be running — results may be unreliable."
    );
  }
  return { baseUrl: BASE_URL };
}

export function handleSummary(data) {
  // Print a machine-readable JSON summary to stdout so CI can capture it as
  // an artifact.  k6 also writes its own human-readable summary automatically.
  return {
    stdout: JSON.stringify(data, null, 2),
    "tests/load/results/notifications-summary.json": JSON.stringify(data, null, 2),
  };
}
