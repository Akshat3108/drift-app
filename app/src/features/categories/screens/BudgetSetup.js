// PS-06 — Budget setup overview.
//
// Single-screen surface for all budgets: header showing `Σ budget` vs the
// trailing-3-completed-month avg income + delta, a per-category list with
// quick ±₹500 steppers, and a two-step "Copy from last month" CTA that
// snaps each category's last-month spend up to the next ₹500.
//
// Reads:
//   - `pots` (live, joined with current-month spend) via useApp().
//   - `incRepo.monthlyTrend(4)` for trailing income avg.
//   - `expRepo.summaryByCategory(prevMonthKey)` for last-month per-category
//     spend (drives the "Copy from last month" feature + sub-line on each
//     row).
// Writes via `updateCategory(id, { budget })` (which then refreshes pots +
// triggers notification re-evaluation).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { expenses as expRepo } from '@features/expenses/repo';
import { income as incRepo } from '@features/income/repo';
import { potBg } from '../../../theme';
import { prevMonth, currentMonthKey, formatMonthLabel } from '@components/primitives/MonthPicker';

const STEP = 500;

// Pure helpers — exported for /tmp/ validation.

// Round `spent` up to the next ₹500. Used by "Copy from last month".
export function snapTo500(spent) {
  if (!Number.isFinite(spent) || spent <= 0) return 0;
  return Math.ceil(spent / STEP) * STEP;
}

// Trailing avg over the N most-recent rows in a [{month_key, total}] list
// SORTED OLDEST→NEWEST. Used to derive the income comparator. Returns
// `{ avg, ready }`. ready=false when fewer than N entries exist OR when any
// of the last N rows has total ≤ 0 (mirrors PS-04's gap-month policy).
export function trailingAvg(rows, months) {
  if (!Array.isArray(rows) || rows.length < months) return { avg: 0, ready: false };
  const tail = rows.slice(-months);
  if (tail.some((r) => !Number.isFinite(r.total) || r.total <= 0)) {
    return { avg: 0, ready: false };
  }
  const sum = tail.reduce((s, r) => s + r.total, 0);
  return { avg: sum / months, ready: true };
}

// Build the patch set for "Copy from last month". Skips pots with no
// last-month spend (per Step-2 decision). Snaps every other pot's new
// budget up to the next ₹500.
export function applyCopyMap(pots, lastSpentByCatId) {
  const out = [];
  for (const p of pots || []) {
    const last = lastSpentByCatId.get(p.id) || 0;
    if (last <= 0) continue;
    const newBudget = snapTo500(last);
    if (newBudget === p.budget) continue;
    out.push({ id: p.id, newBudget });
  }
  return out;
}

function fmtMoney(sym, n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1_00_000) return `${v < 0 ? '−' : ''}${sym}${(abs / 1_00_000).toFixed(1)}L`;
  return `${v < 0 ? '−' : ''}${sym}${abs.toLocaleString('en-IN')}`;
}

function BudgetSetup({ navigation }) {
  const { F, sym, pots, updateCategory, activeMonth } = useApp();
  const insets = useSafeAreaInsets();
  const [incomeTrend, setIncomeTrend] = useState([]);
  const [lastMonthSpend, setLastMonthSpend] = useState(new Map());
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [applying, setApplying] = useState(false);

  const prevMK = useMemo(() => prevMonth(currentMonthKey()), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [trend, lastRows] = await Promise.all([
          incRepo.monthlyTrend(4).catch(() => []),
          expRepo.summaryByCategory(prevMK).catch(() => []),
        ]);
        if (cancelled) return;
        setIncomeTrend(trend || []);
        const m = new Map();
        for (const r of lastRows || []) m.set(r.id, r.spent || 0);
        setLastMonthSpend(m);
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [prevMK]);

  const sumBudget = useMemo(
    () => pots.reduce((s, p) => s + (p.budget || 0), 0),
    [pots],
  );
  const income = useMemo(() => trailingAvg(incomeTrend, 3), [incomeTrend]);
  const delta = income.ready ? sumBudget - income.avg : null;

  const step = useCallback(async (pot, dir) => {
    const next = Math.max(0, (pot.budget || 0) + dir * STEP);
    if (next === pot.budget) return;
    try {
      await updateCategory(pot.id, { budget: next });
    } catch (e) {
      Alert.alert('Could not update', e?.message || String(e));
    }
  }, [updateCategory]);

  const copyFromLastMonth = useCallback(async () => {
    const patches = applyCopyMap(pots, lastMonthSpend);
    if (patches.length === 0) {
      Alert.alert('Nothing to copy', 'No pot had spending last month to base a budget on.');
      setConfirmCopy(false);
      return;
    }
    setApplying(true);
    try {
      for (const { id, newBudget } of patches) {
        await updateCategory(id, { budget: newBudget });
      }
    } catch (e) {
      Alert.alert('Copy failed midway', e?.message || String(e));
    } finally {
      setApplying(false);
      setConfirmCopy(false);
    }
  }, [pots, lastMonthSpend, updateCategory]);

  const sortedPots = useMemo(
    () => [...pots].sort((a, b) => (b.budget || 0) - (a.budget || 0)),
    [pots],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 60, paddingHorizontal: 16 }}
    >
      <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
        Budget <Text style={{ color: F.coral, fontStyle: 'italic' }}>setup</Text>
      </Text>
      <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
        {activeMonth !== currentMonthKey() ? `Viewing ${formatMonthLabel(activeMonth)}` : `Tune monthly budgets per category`}
      </Text>

      {/* Header strip */}
      <View style={{ marginTop: 14, padding: 14, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Σ budget</Text>
            <Text style={{ fontSize: 22, color: F.ink, fontWeight: '700', marginTop: 2 }}>
              {fmtMoney(sym, sumBudget)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>3-mo avg income</Text>
            <Text style={{ fontSize: 22, color: F.ink2, fontWeight: '700', marginTop: 2 }}>
              {income.ready ? fmtMoney(sym, income.avg) : '—'}
            </Text>
          </View>
        </View>

        {income.ready && (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: F.line }}>
            <Text style={{ fontSize: 12, color: delta > 0 ? F.coral : F.sageD }}>
              {delta > 0
                ? `Budget exceeds income by ${fmtMoney(sym, delta)}`
                : delta < 0
                  ? `${fmtMoney(sym, -delta)} cushion vs trailing income`
                  : 'Budget exactly matches trailing income'}
            </Text>
          </View>
        )}
        {!income.ready && (
          <Text style={{ fontSize: 11, color: F.ink3, marginTop: 8 }}>
            Add income for 3 consecutive months to see the comparison.
          </Text>
        )}
      </View>

      {/* Copy-from-last-month CTA */}
      {!confirmCopy ? (
        <TouchableOpacity
          onPress={() => setConfirmCopy(true)}
          activeOpacity={0.85}
          style={{ marginTop: 14, backgroundColor: F.cream, borderRadius: 14,
            paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: F.line }}>
          <Text style={{ color: F.ink, fontSize: 14, fontWeight: '600' }}>
            📋 Copy from last month
          </Text>
          <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
            Uses each category's last-month spend, rounded up to the next ₹500
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={{ marginTop: 14, backgroundColor: F.surface, borderRadius: 14, borderWidth: 1, borderColor: F.coral, padding: 12 }}>
          <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600', marginBottom: 8 }}>
            Overwrite current budgets with last month's spend?
          </Text>
          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 10 }}>
            Pots with no spend last month will be left untouched.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={copyFromLastMonth}
              disabled={applying}
              activeOpacity={0.85}
              style={{ flex: 1, backgroundColor: F.coral, borderRadius: 12,
                paddingVertical: 10, alignItems: 'center', opacity: applying ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                {applying ? 'Applying…' : 'Apply'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmCopy(false)}
              disabled={applying}
              activeOpacity={0.85}
              style={{ flex: 1, backgroundColor: F.surface, borderWidth: 1, borderColor: F.line,
                borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: F.ink2, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Per-pot rows */}
      <View style={{ marginTop: 16, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
        {sortedPots.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: F.ink2 }}>No categories yet.</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditPot')}
              activeOpacity={0.7}
              style={{ marginTop: 10, paddingHorizontal: 14, paddingVertical: 8,
                backgroundColor: F.coral, borderRadius: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Add a category</Text>
            </TouchableOpacity>
          </View>
        ) : (
          sortedPots.map((p, i) => {
            const overrun = (p.spend || 0) > (p.budget || 0) && (p.budget || 0) > 0;
            const lastSpent = lastMonthSpend.get(p.id) || 0;
            return (
              <View key={p.id} style={{
                padding: 14,
                borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10,
                    backgroundColor: potBg(F, p.color || 'cream'),
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 16 }}>{p.emoji}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('EditPot', { id: p.id })}
                    activeOpacity={0.7}
                    style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>{p.label || p.name}</Text>
                    <Text style={{ fontSize: 11, color: overrun ? F.coral : F.ink3, marginTop: 2 }}>
                      Spent {fmtMoney(sym, p.spend || 0)}{lastSpent > 0 ? ` · last mo ${fmtMoney(sym, lastSpent)}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => step(p, -1)}
                      disabled={(p.budget || 0) <= 0}
                      hitSlop={8}
                      style={{ width: 32, height: 32, borderRadius: 16,
                        backgroundColor: F.bg, borderWidth: 1, borderColor: F.line,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: (p.budget || 0) <= 0 ? 0.4 : 1 }}>
                      <Text style={{ fontSize: 18, color: F.ink }}>−</Text>
                    </TouchableOpacity>
                    <View style={{ minWidth: 64, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, color: F.ink, fontWeight: '700' }}>
                        {fmtMoney(sym, p.budget || 0)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => step(p, +1)}
                      hitSlop={8}
                      style={{ width: 32, height: 32, borderRadius: 16,
                        backgroundColor: F.coral,
                        alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18, color: '#fff', fontWeight: '700' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      <Text style={{ fontSize: 10, color: F.ink3, marginTop: 16, textAlign: 'center', lineHeight: 14 }}>
        Each step is {sym}{STEP}. Tap a category to edit it in detail.
      </Text>
    </ScrollView>
  );
}

export default React.memo(BudgetSetup);
