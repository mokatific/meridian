#!/usr/bin/env node
// Simulate a direct deploy_position call via executeTool with a high price_change_pct
import { fileURLToPath } from "url";
import path from "path";

async function main() {
  console.log("simulate_deploy: start");
  console.log("simulate_deploy: importing executeTool...");
  const { executeTool } = await import("../tools/executor.js");
  console.log("simulate_deploy: imported executeTool");

  const args = {
    pool_address: "TEST_POOL_ANTI_CHASE",
    pool_name: "TEST_POOL_ANTI_CHASE",
    amount_y: 0.1,
    strategy: "bid_ask",
    bins_below: 80,
    bins_above: 0,
    single_sided_x: true,
    // set an extremely high recent price change to trigger the guard
    price_change_pct: 12.5,
  };

  console.log("simulate_deploy: calling executeTool deploy_position with args:", args);
  const res = await executeTool("deploy_position", args);
  console.log("simulate_deploy: result:", JSON.stringify(res, null, 2));
  console.log("simulate_deploy: end");
}

main().catch((e) => {
  console.error("simulate_deploy: Script error:", e);
  process.exit(1);
});
