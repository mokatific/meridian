#!/usr/bin/env node
// Force a decision-log entry simulating the anti-chase guard
import { appendDecision } from "../decision-log.js";

const entry = appendDecision({
  type: "screen_reject",
  actor: "SIM_TEST",
  pool: "TEST_POOL_ANTI_CHASE",
  pool_name: "TEST_POOL_ANTI_CHASE",
  summary: "Simulated anti-chase rejection",
  reason: "Simulated recent price change 12.5% > threshold 3%",
  metrics: { priceChangePct: 12.5, thresholdPct: 3 },
});

console.log("Appended decision:", JSON.stringify(entry, null, 2));
