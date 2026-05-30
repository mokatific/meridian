/**
 * RPC Response Cache + Failover — wraps @solana/web3.js Connection with:
 * 1. TTL cache for read-only methods (reduces RPC calls)
 * 2. Automatic failover: primary → fallback on 429/5xx errors
 *
 * Cached methods:
 * - getAccountInfo (60s TTL)
 * - getMultipleAccountsInfo (60s TTL)
 * - getParsedAccountInfo (60s TTL)
 * - getProgramAccounts (30s TTL)
 * - getBalance (30s TTL)
 * - getTokenAccountsByOwner (30s TTL)
 *
 * Write operations (sendTransaction, simulateTransaction, etc.) are NEVER cached.
 * Failover applies to ALL methods (read + write).
 *
 * ENV:
 *   RPC_URL          — primary RPC (Helius)
 *   RPC_URL_FALLBACK — fallback RPC (Other)
 */

import {
  Connection,
  ComputeBudgetProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { log } from "../logger.js";
import { fetchGmgnGasPrice } from "../tools/gmgn.js";

const DEFAULT_TTL_MS = 60_000; // 60s for account data
const SHORT_TTL_MS = 30_000; // 30s for balance/program accounts
const MAX_CACHE_SIZE = 500; // max entries before LRU eviction
const FAILOVER_COOLDOWN_MS = 60_000; // stay on fallback for 60s before retrying primary
const RPC_MAX_RETRIES = Number(process.env.RPC_MAX_RETRIES || 3);
const RPC_RETRY_BASE_MS = Number(process.env.RPC_RETRY_BASE_MS || 1000);
const RPC_RETRY_CAP_MS = Number(process.env.RPC_RETRY_CAP_MS || 30000);

class LRUCache {
  constructor(maxSize = MAX_CACHE_SIZE) {
    this._max = maxSize;
    this._map = new Map();
    this._hits = 0;
    this._misses = 0;
  }

  get(key) {
    const entry = this._map.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      this._misses++;
      return undefined;
    }
    // Move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, entry);
    this._hits++;
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this._map.size >= this._max) {
      const firstKey = this._map.keys().next().value;
      this._map.delete(firstKey);
    }
    this._map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get size() {
    return this._map.size;
  }
  get stats() {
    return { hits: this._hits, misses: this._misses, size: this._map.size };
  }

  clear() {
    this._map.clear();
    this._hits = 0;
    this._misses = 0;
  }
}

const _cache = new LRUCache(MAX_CACHE_SIZE);

// Stats logging every 5 minutes
let _lastStatsLog = 0;
function maybeLogStats() {
  const now = Date.now();
  if (now - _lastStatsLog > 300_000) {
    const s = _cache.stats;
    const hitRate =
      s.hits + s.misses > 0 ? ((s.hits / (s.hits + s.misses)) * 100).toFixed(1) : "0.0";
    log(
      "rpc-cache",
      `stats: ${s.hits} hits, ${s.misses} misses (${hitRate}% hit rate), ${s.size} entries`,
    );
    _lastStatsLog = now;
  }
}

// Failover state
let _usingFallback = false;
let _fallbackSwitchedAt = 0;
let _failoverCount = 0;

function isRetryableError(err) {
  const msg = err?.message || "";
  return (
    msg.includes("429") ||
    msg.includes("Too Many Requests") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("500") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("fetch failed")
  );
}

function isRateLimitError(err) {
  const msg = err?.message || "";
  return msg.includes("429") || msg.includes("Too Many Requests");
}

function getRetryAfterMs(err) {
  const header =
    err?.response?.headers?.get?.("retry-after") ||
    err?.cause?.response?.headers?.get?.("retry-after") ||
    err?.headers?.get?.("retry-after");
  const parsed = Number(header);
  if (Number.isFinite(parsed) && parsed > 0) return parsed * 1000;
  const match = String(err?.message || "").match(/retry-?after[:\s]+(\d+)/i);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return null;
}

function computeBackoffMs(err, attempt) {
  const base = Math.min(RPC_RETRY_CAP_MS, RPC_RETRY_BASE_MS * Math.pow(2, attempt));
  const retryAfter = isRateLimitError(err) ? getRetryAfterMs(err) : null;
  const jitter = 250 + Math.floor(Math.random() * 250);
  const delay = retryAfter ? Math.max(retryAfter, base) : base;
  return Math.min(delay + jitter, RPC_RETRY_CAP_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeConfirmTransactionArgs(args) {
  const [firstArg, secondArg] = args;
  let signature = null;
  let commitment = "confirmed";
  let abortSignal = null;
  let lastValidBlockHeight = null;

  if (typeof firstArg === "string") {
    signature = firstArg;
    if (typeof secondArg === "string") {
      commitment = secondArg;
    } else if (secondArg && typeof secondArg === "object") {
      commitment = secondArg.commitment ?? commitment;
      abortSignal = secondArg.abortSignal ?? null;
      lastValidBlockHeight = secondArg.lastValidBlockHeight ?? null;
    }
    return { signature, commitment, abortSignal, lastValidBlockHeight };
  }

  if (firstArg && typeof firstArg === "object") {
    signature = firstArg.signature ?? firstArg.signatures?.[0] ?? null;
    commitment = firstArg.commitment ?? commitment;
    abortSignal = firstArg.abortSignal ?? null;
    lastValidBlockHeight = firstArg.lastValidBlockHeight ?? null;

    if (typeof secondArg === "string") {
      commitment = secondArg;
    } else if (secondArg && typeof secondArg === "object") {
      commitment = secondArg.commitment ?? commitment;
      abortSignal = secondArg.abortSignal ?? abortSignal;
    }
  }

  return { signature, commitment, abortSignal, lastValidBlockHeight };
}

async function confirmTransactionByPolling(conn, ...args) {
  const { signature, commitment, abortSignal, lastValidBlockHeight } =
    normalizeConfirmTransactionArgs(args);

  if (!signature) {
    throw new Error("confirmTransaction requires a signature");
  }

  const timeoutMs = Number(process.env.RPC_CONFIRM_TIMEOUT_MS || 120000);
  const startedAt = Date.now();
  let delayMs = 500;

  while (true) {
    if (abortSignal?.aborted) {
      throw new Error(`Transaction confirmation aborted for ${signature}`);
    }

    const response = await conn.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = response?.value?.[0] ?? null;

    if (status?.err) {
      const failureReason =
        typeof status.err === "string" ? status.err : JSON.stringify(status.err);
      throw new Error(`Transaction ${signature} failed: ${failureReason}`);
    }

    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return response;
    }

    if (lastValidBlockHeight != null) {
      const currentBlockHeight = await conn.getBlockHeight(commitment);
      if (currentBlockHeight > lastValidBlockHeight) {
        throw new Error(`Signature ${signature} has expired: block height exceeded.`);
      }
    } else if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for confirmation of signature ${signature}`);
    }

    await sleep(delayMs);
    delayMs = Math.min(Math.round(delayMs * 1.5), 2000);
  }
}

/**
 * Create a cached Connection with automatic failover.
 * Primary: RPC_URL (Helius), Fallback: RPC_URL_FALLBACK (Other)
 */
export function createCachedConnection(rpcUrl, commitmentOrConfig = "confirmed") {
  const fallbackUrl = process.env.RPC_URL_FALLBACK;
  const primaryConn = new Connection(rpcUrl, commitmentOrConfig);
  const fallbackConn = fallbackUrl ? new Connection(fallbackUrl, commitmentOrConfig) : null;

  function getActiveConnection() {
    if (!_usingFallback) return primaryConn;
    // Check if cooldown expired — try primary again
    if (Date.now() - _fallbackSwitchedAt > FAILOVER_COOLDOWN_MS) {
      _usingFallback = false;
      log("rpc-failover", `Switching back to primary RPC`);
      return primaryConn;
    }
    return fallbackConn || primaryConn;
  }

  function switchToFallback(err) {
    if (!fallbackConn || _usingFallback) return;
    _usingFallback = true;
    _fallbackSwitchedAt = Date.now();
    _failoverCount++;
    log(
      "rpc-failover",
      `Primary RPC error (${err?.message?.slice(0, 60)}), switching to fallback (#${_failoverCount})`,
    );
  }

  async function withRetries(fn, label) {
    let lastErr = null;
    for (let attempt = 0; attempt <= RPC_MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!isRetryableError(err) || attempt === RPC_MAX_RETRIES) throw err;
        const delay = computeBackoffMs(err, attempt);
        log(
          "rpc-retry",
          `${label} RPC retry in ${Math.round(delay)}ms (attempt ${attempt + 1}/${RPC_MAX_RETRIES + 1})`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  async function withFailover(fn) {
    try {
      return await withRetries(() => fn(getActiveConnection()), "primary");
    } catch (err) {
      if (isRetryableError(err) && fallbackConn) {
        switchToFallback(err);
        // Retry on fallback
        return await withRetries(() => fn(fallbackConn), "fallback");
      }
      throw err;
    }
  }

  // Proxy: intercept specific methods for caching + failover
  return new Proxy(primaryConn, {
    get(target, prop, receiver) {
      // Cache getAccountInfo
      if (prop === "getAccountInfo") {
        return async (publicKey, config2) => {
          const key = `gai:${publicKey.toString()}`;
          const cached = _cache.get(key);
          if (cached !== undefined) {
            maybeLogStats();
            return cached;
          }
          const result = await withFailover((conn) => conn.getAccountInfo(publicKey, config2));
          _cache.set(key, result, DEFAULT_TTL_MS);
          maybeLogStats();
          return result;
        };
      }

      // Cache getMultipleAccountsInfo
      if (prop === "getMultipleAccountsInfo") {
        return async (publicKeys, config2) => {
          const keys = publicKeys.map((pk) => `gai:${pk.toString()}`);
          const allCached = keys.every((k) => _cache.get(k) !== undefined);
          if (allCached) {
            maybeLogStats();
            return keys.map((k) => _cache.get(k));
          }
          const results = await withFailover((conn) =>
            conn.getMultipleAccountsInfo(publicKeys, config2),
          );
          for (let i = 0; i < publicKeys.length; i++) {
            _cache.set(`gai:${publicKeys[i].toString()}`, results[i], DEFAULT_TTL_MS);
          }
          maybeLogStats();
          return results;
        };
      }

      // Cache getParsedAccountInfo
      if (prop === "getParsedAccountInfo") {
        return async (publicKey, config2) => {
          const key = `gpai:${publicKey.toString()}`;
          const cached = _cache.get(key);
          if (cached !== undefined) {
            maybeLogStats();
            return cached;
          }
          const result = await withFailover((conn) =>
            conn.getParsedAccountInfo(publicKey, config2),
          );
          _cache.set(key, result, DEFAULT_TTL_MS);
          maybeLogStats();
          return result;
        };
      }

      // Cache getBalance (shorter TTL)
      if (prop === "getBalance") {
        return async (publicKey, config2) => {
          const key = `gb:${publicKey.toString()}`;
          const cached = _cache.get(key);
          if (cached !== undefined) {
            maybeLogStats();
            return cached;
          }
          const result = await withFailover((conn) => conn.getBalance(publicKey, config2));
          _cache.set(key, result, SHORT_TTL_MS);
          maybeLogStats();
          return result;
        };
      }

      // Cache getProgramAccounts (shorter TTL)
      if (prop === "getProgramAccounts") {
        return async (programId, configOrCommitment) => {
          const filterKey = configOrCommitment
            ? JSON.stringify(configOrCommitment.filters || configOrCommitment)
            : "";
          const key = `gpa:${programId.toString()}:${filterKey}`;
          const cached = _cache.get(key);
          if (cached !== undefined) {
            maybeLogStats();
            return cached;
          }
          const result = await withFailover((conn) =>
            conn.getProgramAccounts(programId, configOrCommitment),
          );
          _cache.set(key, result, SHORT_TTL_MS);
          maybeLogStats();
          return result;
        };
      }

      // Cache getTokenAccountsByOwner (shorter TTL)
      if (prop === "getTokenAccountsByOwner") {
        return async (ownerAddress, filter, commitment) => {
          const filterStr = JSON.stringify(filter);
          const key = `gtabo:${ownerAddress.toString()}:${filterStr}`;
          const cached = _cache.get(key);
          if (cached !== undefined) {
            maybeLogStats();
            return cached;
          }
          const result = await withFailover((conn) =>
            conn.getTokenAccountsByOwner(ownerAddress, filter, commitment),
          );
          _cache.set(key, result, SHORT_TTL_MS);
          maybeLogStats();
          return result;
        };
      }

      if (prop === "confirmTransaction") {
        return async (...args) =>
          withFailover((conn) => confirmTransactionByPolling(conn, ...args));
      }

      // Non-cached methods: still get failover
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        // Wrap with failover for methods that hit RPC
        const rpcMethods = [
          "sendTransaction",
          "sendRawTransaction",
          "simulateTransaction",
          "getLatestBlockhash",
          "getBlockHeight",
          "getSlot",
          "getMinimumBalanceForRentExemption",
          "getSignatureStatuses",
          "getTransaction",
          "getSignaturesForAddress",
          "sendAndConfirmTransaction",
          "getAddressLookupTable",
        ];
        if (rpcMethods.includes(prop)) {
          return async (...args) => {
            return withFailover((conn) => conn[prop](...args));
          };
        }
        return value.bind(target);
      }
      return value;
    },
  });
}

/**
 * Get cache + failover stats
 */
export function getRpcCacheStats() {
  return { ..._cache.stats, usingFallback: _usingFallback, failoverCount: _failoverCount };
}

/**
 * Drop-in replacement for @solana/web3.js sendAndConfirmTransaction that
 * uses HTTP polling instead of WebSocket signatureSubscribe.
 * Helius (and many other RPC providers) don't expose signatureSubscribe on
 * their HTTP endpoint, so the web3.js version throws -32601 errors and the
 * transaction appears to fail even though it landed on-chain.
 */
export async function sendAndConfirmPolling(connection, transaction, signers, opts = {}) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    opts.commitment ?? "confirmed",
  );

  // Inject dynamic priority fee from GMGN (legacy transactions only — VersionedTransaction
  // is pre-built by the DLMM SDK and can't have instructions prepended after signing)
  if (!opts.skipPriorityFee && transaction.instructions) {
    const microLamports = await fetchGmgnGasPrice().catch(() => null);
    if (microLamports) {
      transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
      log("rpc", `Priority fee: ${microLamports} microLamports`);
    }
  }

  let rawTx;
  if (transaction.message && typeof transaction.sign === "function" && !transaction.instructions) {
    // VersionedTransaction
    transaction.message.recentBlockhash = blockhash;
    transaction.sign(signers);
    rawTx = transaction.serialize();
  } else {
    // Legacy Transaction
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer ??= signers[0].publicKey;
    transaction.sign(...signers);
    rawTx = transaction.serialize();
  }

  const signature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: opts.skipPreflight ?? false,
    preflightCommitment: opts.preflightCommitment ?? "confirmed",
    maxRetries: opts.maxRetries ?? 3,
  });

  await confirmTransactionByPolling(connection, signature, {
    commitment: opts.commitment ?? "confirmed",
    lastValidBlockHeight,
  });

  return signature;
}

/**
 * Clear the RPC cache (e.g. after a transaction is sent)
 */
export function clearRpcCache() {
  _cache.clear();
}
