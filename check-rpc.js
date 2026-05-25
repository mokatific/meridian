/**
 * Quick RPC connectivity check
 * Run: node check-rpc.js
 */

import "./envcrypt.js";
import { config } from "./config.js";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.RPC_URL;

console.log(`\n── RPC Connectivity Check ──────────────────`);
console.log(`URL: ${RPC_URL?.replace(/api-key=[^&]+/, "api-key=***") || "NOT SET"}\n`);

if (!RPC_URL) {
  console.error("❌ RPC_URL not set in .env");
  process.exit(1);
}

const conn = new Connection(RPC_URL, "confirmed");

try {
  // 1. Get slot (basic connectivity)
  console.log("1. Testing basic connectivity...");
  const slot = await conn.getSlot();
  console.log(`   ✅ Current slot: ${slot}`);

  // 2. Get SOL balance of a known wallet
  console.log("\n2. Testing balance lookup...");
  const testWallet = new PublicKey("H39AXYDoXjQCV9dkmGMwbBNzYejCKUamh7ZEAaxvJW8h");
  const balance = await conn.getBalance(testWallet);
  console.log(`   ✅ Balance: ${balance / 1e9} SOL`);

  // 3. Get recent blockhash
  console.log("\n3. Testing blockhash fetch...");
  const { blockhash } = await conn.getLatestBlockhash();
  console.log(`   ✅ Blockhash: ${blockhash.slice(0, 12)}...`);

  console.log(`\n✅ RPC is working! Helius credits should be used.`);
  console.log(`   Check dashboard: https://helius.dev/dashboard\n`);
} catch (error) {
  console.error(`\n❌ RPC Error: ${error.message}`);

  if (error.message.includes("403") || error.message.includes("401")) {
    console.error("   → API key invalid or expired");
  } else if (error.message.includes("429")) {
    console.error("   → Rate limited (too many requests)");
  } else if (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED")) {
    console.error("   → Connection failed (check URL/internet)");
  }

  console.log(`\n💡 Try: https://helius.dev to verify API key\n`);
  process.exit(1);
}
