// PS-32 — asset-class breakdown for the Net Worth donut.
//
// PS-04 ships the 2-arc assets-vs-liabilities donut. This adds a "by asset
// class" mode: 6–8 arcs rolled up from `accounts.category` (free text, so we
// normalise it JS-side rather than rebuilding the table with a CHECK) plus
// `holdings.kind`. Pure — exported for /tmp validation.

// Ordered so the legend/arc colours stay stable regardless of which classes a
// given user actually has. `key` matches the normaliser output.
export const ASSET_CLASSES = [
  { key: 'cash',        label: 'Cash',        color: '#6a8d73' },
  { key: 'bank',        label: 'Bank',        color: '#5b9aa0' },
  { key: 'equity',      label: 'Equity / MF', color: '#e88373' },
  { key: 'gold',        label: 'Gold',        color: '#e0b341' },
  { key: 'fd',          label: 'FD',          color: '#9b8bd0' },
  { key: 'rd',          label: 'RD',          color: '#c089b8' },
  { key: 'retirement',  label: 'NPS / PPF',   color: '#7d9fd6' },
  { key: 'real_estate', label: 'Real estate', color: '#b09c8a' },
  { key: 'vehicle',     label: 'Vehicle',     color: '#a0a0a0' },
  { key: 'other',       label: 'Other',       color: '#c4b59d' },
];
const CLASS_META = Object.fromEntries(ASSET_CLASSES.map((c) => [c.key, c]));

// Map a free-text accounts.category to a class key. Order matters — earlier
// patterns win (e.g. "real estate loan" never reaches here since liabilities
// are excluded upstream; "home" → real_estate, but matched after bank so
// "home loan account" categorised as bank stays bank).
export function normalizeAssetClass(category) {
  const c = String(category || '').toLowerCase().trim();
  if (!c) return 'other';
  if (/\bcash\b|wallet|petty|on.?hand/.test(c)) return 'cash';
  if (/bank|saving|salary|current|checking|chequing/.test(c)) return 'bank';
  if (/recurring.?dep|\brd\b/.test(c)) return 'rd';
  if (/fixed.?dep|\bfd\b|term.?dep/.test(c)) return 'fd';
  if (/nps|ppf|epf|pension|provident|retire/.test(c)) return 'retirement';
  if (/real.?estate|property|land|plot|\bflat\b|\bhouse\b|apartment/.test(c)) return 'real_estate';
  if (/vehicle|\bcar\b|\bbike\b|scooter|\bauto\b/.test(c)) return 'vehicle';
  if (/gold|silver|jewel|bullion/.test(c)) return 'gold';
  if (/equity|stock|\bshare\b|demat|mutual|\bmf\b|\bsip\b|fund/.test(c)) return 'equity';
  return 'other';
}

// holdings.kind enum → class key.
export function holdingClass(kind) {
  switch (kind) {
    case 'mf': case 'equity': return 'equity';
    case 'gold': return 'gold';
    case 'fd': return 'fd';
    case 'rd': return 'rd';
    case 'nps': case 'ppf': return 'retirement';
    default: return 'other';
  }
}

// Roll asset accounts + holdings into class buckets. Returns buckets sorted
// desc by value, each with its contributing members and a stable colour.
//   assetAccounts — accounts with kind='asset' (liabilities excluded by caller)
//   holdings      — live holdings, each decorated with current_value
export function assetClassBreakdown(assetAccounts = [], holdings = []) {
  const buckets = new Map(); // key -> { key,label,color,value,members[] }
  const add = (key, label, value, type) => {
    const v = Number(value) || 0;
    if (v <= 0) return;
    const meta = CLASS_META[normKey(key)];
    const b = buckets.get(meta.key) || { ...meta, value: 0, members: [] };
    b.value += v;
    b.members.push({ type, label, value: v });
    buckets.set(meta.key, b);
  };
  for (const a of assetAccounts) add(normalizeAssetClass(a.category), a.label, a.balance, 'account');
  for (const h of holdings) {
    const value = h.current_value != null ? h.current_value : (Number(h.units) || 0) * (Number(h.current_nav) || 0);
    add(holdingClass(h.kind), h.label, value, 'holding');
  }
  const out = [...buckets.values()].sort((a, b) => b.value - a.value);
  for (const b of out) b.members.sort((x, y) => y.value - x.value);
  return out;
}

// Defensive: a class key that somehow isn't in CLASS_META lands in 'other'.
function normKey(key) {
  return CLASS_META[key] ? key : 'other';
}

// Multi-arc donut path generator. segments: [{ value, color, key }]. Returns
// one ring path per segment, drawn clockwise from 12-o'clock, plus its fraction
// for legend/label maths. Shares the arc maths with PS-04's donutArc.
export function multiArcDonut(segments, cx, cy, rOuter, rInner) {
  const total = (segments || []).reduce((s, x) => s + (Number(x.value) || 0), 0);
  if (!Number.isFinite(total) || total <= 0) return [];
  const ringPath = (startFrac, sweepFrac) => {
    if (sweepFrac <= 0) return '';
    const a0 = -Math.PI / 2 + startFrac * 2 * Math.PI;
    const a1 = -Math.PI / 2 + (startFrac + sweepFrac) * 2 * Math.PI;
    const sx = cx + rOuter * Math.cos(a0), sy = cy + rOuter * Math.sin(a0);
    const ex = cx + rOuter * Math.cos(a1), ey = cy + rOuter * Math.sin(a1);
    const sxI = cx + rInner * Math.cos(a1), syI = cy + rInner * Math.sin(a1);
    const exI = cx + rInner * Math.cos(a0), eyI = cy + rInner * Math.sin(a0);
    const large = sweepFrac > 0.5 ? 1 : 0;
    return `M ${sx.toFixed(2)} ${sy.toFixed(2)} ` +
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} ` +
      `L ${sxI.toFixed(2)} ${syI.toFixed(2)} ` +
      `A ${rInner} ${rInner} 0 ${large} 0 ${exI.toFixed(2)} ${eyI.toFixed(2)} Z`;
  };
  let cursor = 0;
  return segments.map((s) => {
    const frac = (Number(s.value) || 0) / total;
    const path = ringPath(cursor, frac);
    const out = { key: s.key, color: s.color, frac, startFrac: cursor, path };
    cursor += frac;
    return out;
  });
}
