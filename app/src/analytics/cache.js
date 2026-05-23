// 6.1 — analytics_cache helper.
//
// Lazy materialisation with TTL. Callers pass a deterministic `key` (the
// computation's identity), `ttlSec` (how long the result is acceptable),
// `scope` (a coarse tag — see SCOPES below), and a `computeFn` that runs
// the underlying SQL when the cache misses. Hits are decoded JSON; misses
// run computeFn, JSON-encode the result, INSERT OR REPLACE, and return it.
//
// TTL is rendered as absolute `expires_at` so reads are O(1) comparisons.
// No mutation-time invalidation in this batch (6.12+ will wire that via
// `invalidate(scope[])` once the Hub knows which keys it owns).
//
// JSON encoding decision: SQLite stores TEXT — analytics outputs are flat
// JS objects/arrays of numbers + strings (no Date instances, no Maps, no
// Sets — every analytics function below returns serialisable data). If a
// future function needs richer types it must serialise on the way in.

import { exec, all, one } from '../db';

export const SCOPES = Object.freeze({
  SPEND:         'spend',
  ITEMS:         'items',
  SUBSCRIPTIONS: 'subscriptions',
  FORECAST:      'forecast',
  SEASONAL:      'seasonal',
  LIFESTYLE:     'lifestyle',
  ANOMALY:       'anomaly',
  PATTERNS:      'patterns',
});

const VALID_SCOPES = new Set(Object.values(SCOPES));

// Read-through cache. computeFn is only invoked on miss / expired.
// Throws if scope is unknown — surfaces typos at the call site rather than
// silently writing untaggable rows.
export async function getCached(key, ttlSec, computeFn, { scope } = {}) {
  if (!key || typeof key !== 'string') throw new Error('analytics_cache: key required');
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) throw new Error('analytics_cache: ttlSec > 0');
  if (typeof computeFn !== 'function') throw new Error('analytics_cache: computeFn required');
  if (!scope || !VALID_SCOPES.has(scope)) throw new Error(`analytics_cache: unknown scope "${scope}"`);

  const row = await one(
    `SELECT value FROM analytics_cache
      WHERE key = ? AND expires_at > datetime('now')`,
    [key]
  );
  if (row && typeof row.value === 'string') {
    try { return JSON.parse(row.value); }
    catch (_) { /* corrupted row — fall through to recompute */ }
  }

  const value = await computeFn();
  const encoded = JSON.stringify(value);
  await exec(
    `INSERT OR REPLACE INTO analytics_cache (key, scope, value, expires_at, created_at)
     VALUES (?, ?, ?, datetime('now', ?), datetime('now'))`,
    [key, scope, encoded, `+${Math.floor(ttlSec)} seconds`]
  );
  return value;
}

// Bulk invalidate by scope. Exposed for 6.12+ — not called from this batch.
export async function invalidate(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return;
  const valid = scopes.filter((s) => VALID_SCOPES.has(s));
  if (valid.length === 0) return;
  const placeholders = valid.map(() => '?').join(',');
  await exec(`DELETE FROM analytics_cache WHERE scope IN (${placeholders})`, valid);
}

// Wipe a single key. Used by callers that want surgical invalidation.
export async function invalidateKey(key) {
  if (!key) return;
  await exec('DELETE FROM analytics_cache WHERE key = ?', [key]);
}

// Maintenance — delete every expired row. Cheap; safe to call ad-hoc.
export async function evictExpired() {
  await exec(`DELETE FROM analytics_cache WHERE expires_at <= datetime('now')`);
}

// Diagnostic — returns row count + per-scope counts. Not for hot paths.
export async function stats() {
  const total = await one('SELECT COUNT(*) AS n FROM analytics_cache');
  const byScope = await all(
    'SELECT scope, COUNT(*) AS n FROM analytics_cache GROUP BY scope'
  );
  return { total: total?.n ?? 0, byScope };
}
