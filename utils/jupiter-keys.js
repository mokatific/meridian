/**
 * Jupiter API key manager with primary + backup fallback.
 *
 * Priority:
 *   1. JUPITER_API_KEY (env) — user's own key
 *   2. JUPITER_API_KEY_BACKUP (env) — backup key
 *   3. DEFAULT_JUPITER_API_KEY — built-in from repo
 *
 * If a request with primary key returns 401/403, caller can retry with backup.
 */

const DEFAULT_JUPITER_API_KEY = "b15d42e9-e0e4-4f90-a424-ae41ceeaa382";

function getKey1() {
  return process.env.JUPITER_API_KEY || DEFAULT_JUPITER_API_KEY;
}

function getKey2() {
  return process.env.JUPITER_API_KEY_BACKUP || DEFAULT_JUPITER_API_KEY;
}

/**
 * Get the primary Jupiter API key.
 */
export function getJupiterApiKey() {
  return getKey1();
}

/**
 * Get the backup Jupiter API key.
 */
export function getJupiterBackupKey() {
  return getKey2();
}

/**
 * Check if backup key is different from primary (i.e. actually configured).
 */
export function hasBackupKey() {
  return !!process.env.JUPITER_API_KEY_BACKUP && process.env.JUPITER_API_KEY_BACKUP !== getKey1();
}

/**
 * Get headers with primary API key.
 */
export function getJupiterHeaders() {
  return { "x-api-key": getJupiterApiKey() };
}

/**
 * Get headers with backup API key.
 */
export function getJupiterBackupHeaders() {
  return { "x-api-key": getJupiterBackupKey() };
}

/**
 * Fetch with automatic fallback to backup key on auth errors (401/403).
 * Returns the successful response.
 */
export async function fetchWithJupiterKey(url, options = {}) {
  const key1 = getJupiterApiKey();
  const key2 = getJupiterBackupKey();
  const keys = [key1];
  if (hasBackupKey() && key2 !== key1) keys.push(key2);

  for (let i = 0; i < keys.length; i++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "x-api-key": keys[i],
      },
    });
    if (res.ok) return res;
    if ((res.status === 401 || res.status === 403) && i < keys.length - 1) {
      continue; // try backup key
    }
    return res; // return failed response
  }
  // Should not reach here, but just in case
  return fetch(url, options);
}
