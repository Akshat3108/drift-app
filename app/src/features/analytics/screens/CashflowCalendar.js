// PS-27 — Unified forward outflow calendar. Overlays five projected outflow
// streams — subscriptions (7.2), EMI installments (7.5), insurance renewals
// (PS-11), utility next-bills (7.12), and recurring-expense projections (7.11)
// — into a single forward agenda over a 30 / 60 / 90 day horizon, with per-day
// totals + stacked chips. Tap a day → a sheet with the full event list.
//
// Reads the repos directly and re-projects on every focus / pull-to-refresh;
// no caching, no new schema. Rendered as a forward agenda (days-with-events)
// rather than a literal month grid because a 60/90-day horizon spans multiple
// months — the agenda keeps per-day totals + chip stacking while staying
// readable on a phone.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { subs as subsRepo } from '@features/subs/repo';
import { emiRepo } from '@features/emi/repo';
import { insuranceRepo } from '@features/insurance/repo';
import { utilityAccountsRepo, utilityBillsRepo } from '@features/utilities/repo';
import { recurringCandidates, emiAmount } from '../../../analytics';

const HORIZONS = [
  { key: '30', label: '30 days', days: 30 },
  { key: '60', label: '60 days', days: 60 },
  { key: '90', label: '90 days', days: 90 },
];

// ── date helpers (local-time, date-only) ─────────────────────────────────────
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

// Monthly occurrences (day-of-month, clamped to the month length) within range.
function monthlyOccurrences(dayOfMonth, fromDate, toDate) {
  const out = [];
  let cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  let guard = 0;
  while (cur <= end && guard++ < 48) {
    const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const occ = new Date(cur.getFullYear(), cur.getMonth(), Math.min(dayOfMonth, dim));
    if (occ >= fromDate && occ <= toDate) out.push(occ);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out;
}

// Subscription occurrences stepping from next_bill by its period.
function subOccurrences(nextBill, period, fromDate, toDate) {
  const start = parseYMD(nextBill);
  if (!start) return [];
  const step = period === 'yr'
    ? (x) => x.setFullYear(x.getFullYear() + 1)
    : period === 'wk'
      ? (x) => x.setDate(x.getDate() + 7)
      : period === '3mo' || period === 'qtr'
        ? (x) => x.setMonth(x.getMonth() + 3)
        : (x) => x.setMonth(x.getMonth() + 1);
  const out = [];
  const d = new Date(start);
  let guard = 0;
  while (d < fromDate && guard++ < 400) step(d);
  while (d <= toDate && guard++ < 400) { if (d >= fromDate) out.push(new Date(d)); step(d); }
  return out;
}

// Pure projector — returns events [{date, label, icon, amount, kind}] sorted by
// date. Exported-shape inputs keep it unit-testable without the repos.
export function buildOutflowEvents({ horizonDays, subs, loans, policies, utilAccounts, utilLast, recurring }) {
  const from = startOfToday();
  const to = new Date(from); to.setDate(to.getDate() + horizonDays);
  const events = [];
  const push = (dateObj, ev) => { if (dateObj >= from && dateObj <= to) events.push({ date: ymd(dateObj), ...ev }); };

  for (const s of (subs || [])) {
    if (s.cancelled || s.deleted_at || !s.next_bill) continue;
    for (const d of subOccurrences(s.next_bill, s.period, from, to)) {
      push(d, { label: s.name, icon: s.icon || '📺', amount: Number(s.amount) || 0, kind: 'sub' });
    }
  }
  for (const l of (loans || [])) {
    if (l.deleted_at) continue;
    if ((Number(l.installments_paid) || 0) >= (Number(l.tenure_months) || 0)) continue;
    for (const d of monthlyOccurrences(Number(l.bill_day) || 1, from, to)) {
      push(d, { label: l.name || l.lender || 'EMI', icon: l.icon || '🏦', amount: emiAmount(l), kind: 'emi' });
    }
  }
  for (const p of (policies || [])) {
    if (p.deleted_at || !p.next_due) continue;
    const d = parseYMD(p.next_due);
    if (d) push(d, { label: p.label, icon: p.icon || '🛡️', amount: Number(p.premium_amount) || 0, kind: 'insurance' });
  }
  for (const u of (utilAccounts || [])) {
    if (u.deleted_at || u.billing_day == null) continue;
    const est = Number(utilLast?.get?.(u.id)?.last_total) || 0;
    for (const d of monthlyOccurrences(Number(u.billing_day), from, to)) {
      push(d, { label: u.name, icon: u.icon || '💡', amount: est, kind: 'utility' });
    }
  }
  for (const c of (recurring || [])) {
    if (c.logged_this_month_id != null) continue;
    const d = parseYMD(c.projected_date_this_month);
    if (d) push(d, { label: c.merchant, icon: c.category_emoji || '🔁', amount: Number(c.expected_amount) || 0, kind: 'recurring' });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

// Group events by day → [{date, items, total}] for the agenda.
function groupByDay(events) {
  const map = new Map();
  for (const e of events) {
    let g = map.get(e.date);
    if (!g) { g = { date: e.date, items: [], total: 0 }; map.set(e.date, g); }
    g.items.push(e);
    g.total += e.amount;
  }
  return Array.from(map.values());
}

function prettyDate(iso) {
  const d = parseYMD(iso);
  if (!d) return iso;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function CashflowCalendar() {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();
  const [horizonKey, setHorizonKey] = useState('30');
  const [events, setEvents] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null); // a {date, items, total} group

  const horizonDays = HORIZONS.find((h) => h.key === horizonKey)?.days ?? 30;

  const load = useCallback(async () => {
    try {
      const [subs, loans, policies, utilAccounts, utilLast, rec] = await Promise.all([
        subsRepo.list().catch(() => []),
        emiRepo.listLive().catch(() => []),
        insuranceRepo.list().catch(() => []),
        utilityAccountsRepo.listLive().catch(() => []),
        utilityBillsRepo.aggregatesByAccount().catch(() => new Map()),
        recurringCandidates().then((r) => (r?.ready ? r.candidates : [])).catch(() => []),
      ]);
      setEvents(buildOutflowEvents({ horizonDays, subs, loans, policies, utilAccounts, utilLast, recurring: rec }));
    } catch {
      setEvents([]);
    }
  }, [horizonDays]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const days = useMemo(() => groupByDay(events || []), [events]);
  const grandTotal = useMemo(() => (events || []).reduce((s, e) => s + e.amount, 0), [events]);
  const maxDay = useMemo(() => days.reduce((m, d) => Math.max(m, d.total), 0), [days]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral} />}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 13, color: F.ink2 }}>Projected outflow · next {horizonDays} days</Text>
        <Text style={{ fontSize: 40, color: F.coral, fontWeight: '600', marginTop: 2 }}>
          {sym}{Math.round(grandTotal).toLocaleString()}
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
          Subscriptions · EMIs · insurance · utilities · recurring spends
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {HORIZONS.map((h) => {
          const sel = horizonKey === h.key;
          return (
            <TouchableOpacity key={h.key} onPress={() => setHorizonKey(h.key)}
              accessibilityRole="button" accessibilityState={{ selected: sel }}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 99,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line, alignItems: 'center' }}>
              <Text style={{ color: sel ? '#fff' : F.ink2, fontWeight: sel ? '700' : '500', fontSize: 12 }}>
                {h.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {events == null ? (
        <Text style={{ textAlign: 'center', color: F.ink3, padding: 40 }}>Loading…</Text>
      ) : days.length === 0 ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24,
          borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 10 }}>🗓️</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>Nothing scheduled</Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 6, textAlign: 'center' }}>
            No subscriptions, EMIs, insurance, utilities, or recurring spends fall in this window.
          </Text>
        </View>
      ) : (
        days.map((d) => {
          const intensity = maxDay > 0 ? Math.min(1, d.total / maxDay) : 0;
          return (
            <TouchableOpacity key={d.date} activeOpacity={0.8} onPress={() => setSelected(d)}
              style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1, borderColor: F.line,
                padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* magnitude rail */}
              <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2,
                backgroundColor: F.coral, opacity: 0.25 + intensity * 0.75 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>{prettyDate(d.date)}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {d.items.slice(0, 4).map((it, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                      backgroundColor: F.cream, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11 }}>{it.icon}</Text>
                      <Text style={{ fontSize: 11, color: F.ink2 }} numberOfLines={1}>{it.label}</Text>
                    </View>
                  ))}
                  {d.items.length > 4 && (
                    <Text style={{ fontSize: 11, color: F.ink3, alignSelf: 'center' }}>+{d.items.length - 4}</Text>
                  )}
                </View>
              </View>
              <Text style={{ fontSize: 15, color: F.ink, fontWeight: '700' }}>
                {sym}{Math.round(d.total).toLocaleString()}
              </Text>
            </TouchableOpacity>
          );
        })
      )}

      {/* Day detail sheet */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setSelected(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{ backgroundColor: F.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: 20, paddingBottom: insets.bottom + 20 }}>
            {selected && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                  <Text style={{ fontSize: 17, color: F.ink, fontWeight: '600' }}>{prettyDate(selected.date)}</Text>
                  <Text style={{ fontSize: 17, color: F.coral, fontWeight: '700' }}>
                    {sym}{Math.round(selected.total).toLocaleString()}
                  </Text>
                </View>
                {selected.items.map((it, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                    <Text style={{ fontSize: 18 }}>{it.icon}</Text>
                    <Text style={{ flex: 1, fontSize: 14, color: F.ink }}>{it.label}</Text>
                    <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
                      {sym}{Math.round(it.amount).toLocaleString()}
                    </Text>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setSelected(null)}
                  style={{ marginTop: 16, backgroundColor: F.coral, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

export default React.memo(CashflowCalendar);
