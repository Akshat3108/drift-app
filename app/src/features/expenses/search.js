// 5.2 — search helpers. Pure JS; no React, no DB, no Expo. Used by the
// Search screen and the expenses/items repos.
//
// FTS5 syntax safety: bare user input that contains FTS5 operators
// (`* : ^ ( ) "`) can crash a MATCH query. `sanitizeFtsQuery` splits the
// input into tokens, strips those operators, escapes embedded double-quotes
// the FTS5 way (`""`), wraps each token in `"…"` to disable any remaining
// operator interpretation, and appends `*` for prefix matching. Returns the
// joined MATCH string, or `null` if the input has no usable tokens.

export const MAX_RECENT_SEARCHES = 8;

const FTS_OPERATORS = /[*:^()]/g;

export function sanitizeFtsQuery(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(FTS_OPERATORS, '').trim())
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`);
  if (!tokens.length) return null;
  return tokens.join(' AND ');
}

// In-memory dedup + cap for the recent-searches list. Case-insensitive match
// to avoid `Milk` and `milk` coexisting; the original casing of the new entry
// wins (so the user sees their latest spelling).
export function pushRecent(list, query) {
  const q = (query == null ? '' : String(query)).trim();
  if (!q) return Array.isArray(list) ? list.slice(0, MAX_RECENT_SEARCHES) : [];
  const lc = q.toLowerCase();
  const prev = Array.isArray(list) ? list : [];
  const filtered = prev.filter((entry) => String(entry).toLowerCase() !== lc);
  filtered.unshift(q);
  return filtered.slice(0, MAX_RECENT_SEARCHES);
}

export function removeRecent(list, query) {
  const lc = (query == null ? '' : String(query)).trim().toLowerCase();
  if (!lc) return Array.isArray(list) ? list.slice() : [];
  const prev = Array.isArray(list) ? list : [];
  return prev.filter((entry) => String(entry).toLowerCase() !== lc);
}
