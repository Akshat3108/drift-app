// Compact number: 1.2k / 3.4M; ≤ 999 → integer string.
export function formatShort(n) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (a >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toFixed(0);
}

// Trim long display strings to `max` chars + ellipsis.
export function shorten(s, max = 10) {
  if (!s) return 'Trip';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Whole-day diff between today (local midnight) and `d` ('YYYY-MM-DD').
// Returns null when `d` is falsy; negative when `d` is in the past.
export function daysUntil(d) {
  if (!d) return null;
  const target = new Date(d + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

// Human label over daysUntil: '—' / 'in progress' / 'today' / 'in N days'.
export function daysUntilLabel(d) {
  const diff = daysUntil(d);
  if (diff === null) return '—';
  if (diff < 0) return 'in progress';
  if (diff === 0) return 'today';
  return `in ${diff} days`;
}
