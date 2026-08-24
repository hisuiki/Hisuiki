/**
 * Per-identity request quotas for the write paths anyone signed in can reach.
 *
 * In-process, like the session and page caches: a caller whose next request lands on another Cloud
 * Run instance gets a fresh window, so the effective ceiling is the quota times the instance count.
 * That is deliberate — the point is to bound one account's cost, not to meter it exactly, and a
 * shared counter would mean running a datastore for the sake of an approximation.
 */
import { TtlCache } from "./CacheService.js";

/** One hour matches the longest window any caller asks for; entries expire on their own. */
const attempts = new TtlCache<number[]>(60 * 60 * 1000, 50_000);

/**
 * Records one use of `key`'s quota and reports whether it was within the limit. A rejected call
 * costs nothing against the window, so a client that keeps hammering does not extend its own
 * lockout past the limit's natural expiry.
 */
export function consumeQuota(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < windowMs);

  if (recent.length >= limit) {
    attempts.set(key, recent, recent.length);
    return false;
  }

  recent.push(now);
  attempts.set(key, recent, recent.length);
  return true;
}
