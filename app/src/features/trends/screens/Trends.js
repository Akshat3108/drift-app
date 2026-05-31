import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useExpenses } from '@features/expenses/context';
import { expenses as expRepo } from '@features/expenses/repo';
import { ProgressBar } from '@components/primitives/ProgressBar';
import TrendChart from '@components/charts/TrendChart';
import CategoryRow from '@features/trends/components/CategoryRow';
import { palette } from '../../../theme';
import { withProfiler } from '@core/utils/perf';
import { MonthPicker, currentMonthKey, formatMonthLabel } from '@components/primitives/MonthPicker';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// 6.22 — three comparison modes for the screen.
// 'current' is the legacy view (no per-pot delta, 6-month bar window).
// 'mom' compares the current month against the previous calendar month.
// 'yoy' compares against the same month one year ago and widens the bar
// chart window to 24 months so the comparison anchor is visible on-screen.
const MODES = [
  { key: 'current', label: 'Current',        bars: 6,  shift: 0 },
  { key: 'mom',     label: 'vs Prev mo',     bars: 6,  shift: -1 },
  { key: 'yoy',     label: 'vs Same mo LY',  bars: 24, shift: -12 },
];

// Shift a 'YYYY-MM' key by a signed number of months. Used by MoM/YoY to
// look up the comparison month in monthly_summary. Pure / null-safe.
function shiftMonthKey(mk, deltaMonths) {
  if (!mk || typeof mk !== 'string' || !mk.includes('-')) return null;
  const [yStr, mStr] = mk.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  const total = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

// Δ% with direction. Returns null when prev is 0/null/undefined (no baseline
// to compare against). Truncated to whole numbers for display compactness.
export function monthDelta(thisTotal, prevTotal) {
  if (!Number.isFinite(prevTotal) || prevTotal <= 0) return null;
  if (!Number.isFinite(thisTotal)) thisTotal = 0;
  const pct = ((thisTotal - prevTotal) / prevTotal) * 100;
  const direction = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  return { pct, direction };
}

// Friendly anchor month label for the comparison ("vs Apr '24"). Keeps
// the year suffix because YoY mode renders two-year-old anchors.
function anchorLabel(monthKey) {
  if (!monthKey) return '';
  const [y, m] = monthKey.split('-').map((n) => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return '';
  return `${MONTH_NAMES[m - 1]} '${String(y).slice(-2)}`;
}

function Trends({ navigation }) {
  const { F, sym, pots, goals, totalSpend,
    activeMonth, setActiveMonth, resetActiveMonth } = useApp();
  const { monthlyTrend } = useExpenses();
  const insets = useSafeAreaInsets();
  const pal = palette(F);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const viewingHistory = activeMonth !== currentMonthKey();

  const [mode, setMode]                       = useState('current');
  const [trend, setTrend]                     = useState([]);
  const [selectedMonth, setSelectedMonth]     = useState(null);
  const [comparePots, setComparePots]         = useState([]); // [{id, spent}]
  const [compareLabel, setCompareLabel]       = useState('');

  const modeMeta = MODES.find((m) => m.key === mode) ?? MODES[0];
  const today = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const anchorMonth = modeMeta.shift !== 0 ? shiftMonthKey(today, modeMeta.shift) : null;

  // 8.3 — stable per-row callback so CategoryRow's React.memo can short-
  // circuit when its props haven't changed (the parent re-renders
  // frequently as comparePots / mode / selectedMonth shift, but most rows'
  // identity-stable props don't).
  const onCategoryPress = useCallback((potId, emoji, label) => {
    navigation.navigate('PotDetail', { potId, potName: `${emoji} ${label}` });
  }, [navigation]);

  // 1) Bar-chart trend. Width depends on mode (6 for current/mom, 24 for yoy).
  useEffect(() => {
    monthlyTrend(modeMeta.bars).then((rows) => {
      const enriched = rows.map((r) => {
        const [y, m] = r.month_key.split('-');
        return {
          key: r.month_key,
          m: MONTH_NAMES[parseInt(m, 10) - 1],
          full: MONTH_NAMES[parseInt(m, 10) - 1] + ' ' + y,
          v: r.total,
        };
      });
      setTrend(enriched);
      setSelectedMonth(enriched.length ? enriched.length - 1 : null);
    });
  }, [monthlyTrend, modeMeta.bars]);

  // 2) Per-pot comparison spend. Only fired in mom/yoy modes — current mode
  // shows no delta and we don't pay the extra round-trip.
  useEffect(() => {
    if (!anchorMonth) { setComparePots([]); setCompareLabel(''); return; }
    let cancelled = false;
    expRepo.summaryByCategory(anchorMonth).then((rows) => {
      if (cancelled) return;
      // rows: [{id, name, emoji, color, budget, sort_order, spent}]
      setComparePots(rows.map((r) => ({ id: r.id, spent: r.spent })));
      setCompareLabel(anchorLabel(anchorMonth));
    });
    return () => { cancelled = true; };
  }, [anchorMonth]);

  // Trend chart series + comparison anchors. The month-trend bars/line/area/dot
  // are now rendered by the shared TrendChart (selection + YoY anchor stay
  // controlled here so the header delta + callout below keep working).
  const trendSeries = useMemo(
    () => trend.map((d) => ({ value: d.v, label: d.m, key: d.key })),
    [trend]
  );
  const prevMonth = trend.length >= 2 ? trend[trend.length - 2] : null;
  const thisMonth = trend.length ? trend[trend.length - 1] : null;

  // Header chip — varies by mode. 'current' shows the legacy MoM-of-trend chip;
  // 'mom' shows the same; 'yoy' compares against the YoY anchor.
  let headerDelta = null;
  let headerAnchorLabel = '';
  if (mode === 'yoy' && thisMonth) {
    const anchor = trend.find((d) => d.key === anchorMonth);
    if (anchor) {
      headerDelta = monthDelta(thisMonth.v, anchor.v);
      headerAnchorLabel = anchor.full;
    }
  } else if (prevMonth && thisMonth) {
    headerDelta = monthDelta(thisMonth.v, prevMonth.v);
    headerAnchorLabel = prevMonth.full;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
    >
      <Text style={{ fontSize: 26, color: F.ink, marginBottom: 8 }}>
        Where it <Text style={{ color: F.coral, fontStyle: 'italic' }}>flowed</Text>
      </Text>

      {/* PS-05 — month chip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <TouchableOpacity
          onPress={() => setMonthPickerOpen(true)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: viewingHistory ? F.surface : F.cream,
            borderWidth: 1, borderColor: viewingHistory ? F.coral : F.line,
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}>
          <Text style={{ fontSize: 13, color: viewingHistory ? F.coral : F.ink, fontWeight: '600' }}>
            📅 {formatMonthLabel(activeMonth)}
          </Text>
          <Text style={{ fontSize: 11, color: F.ink3 }}>▾</Text>
        </TouchableOpacity>
        {viewingHistory && (
          <TouchableOpacity onPress={resetActiveMonth} activeOpacity={0.7}>
            <Text style={{ fontSize: 11, color: F.coral, textDecorationLine: 'underline' }}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      <MonthPicker
        visible={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        value={activeMonth}
        onChange={setActiveMonth}
        F={F}/>

      {/* 6.22 — comparison-mode pills. Hidden when no pots exist (the screen
          shows the legacy empty-state instead, so the toggle would be moot). */}
      {pots.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {MODES.map((mm) => {
            const sel = mode === mm.key;
            return (
              <TouchableOpacity
                key={mm.key}
                onPress={() => setMode(mm.key)}
                hitSlop={{ top: 8, bottom: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Compare ${mm.label}`}
                accessibilityState={{ selected: sel }}
                style={{
                  flex: 1, paddingVertical: 9, borderRadius: 99,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line,
                  alignItems: 'center',
                }}>
                <Text style={{ color: sel ? '#fff' : F.ink2,
                  fontWeight: sel ? '700' : '500', fontSize: 12 }}>
                  {mm.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1,
        borderColor: F.line, marginBottom: 16, overflow: 'hidden' }}>
        <View style={{ padding: 18, paddingBottom: 12 }}>
          <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>
            Spending by category
          </Text>
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 2 }}>
            Total: <Text style={{ color: F.coral, fontWeight: '700' }}>{sym}{totalSpend.toFixed(0)}</Text>
            {'  '}this month
            {compareLabel ? <Text style={{ color: F.ink3 }}>{` · vs ${compareLabel}`}</Text> : null}
          </Text>
        </View>

        {pots.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center', borderTopWidth: 1, borderTopColor: F.line }}>
            <Text style={{ fontSize: 13, color: F.ink3 }}>No categories yet</Text>
          </View>
        ) : pots.map((p, i) => {
          // 6.22 — per-pot Δ vs comparison anchor. Null when mode='current'
          // or when comparePots hasn't loaded yet or this pot didn't exist
          // in the anchor month.
          const prevSpent = comparePots.find((cp) => cp.id === p.id)?.spent;
          const deltaInfo = anchorMonth ? monthDelta(p.spend, prevSpent) : null;
          return (
            <CategoryRow
              key={p.id}
              pot={p}
              F={F}
              sym={sym}
              palColor={pal[i % pal.length]}
              deltaInfo={deltaInfo}
              compareLabel={compareLabel}
              prevSpent={prevSpent}
              onPress={onCategoryPress}
            />
          );
        })}

        <TouchableOpacity
          onPress={() => navigation.navigate('AllExpenses')}
          activeOpacity={0.7}
          style={{ padding: 14, borderTopWidth: 1, borderTopColor: F.line, alignItems: 'center' }}
        >
          <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>View all transactions →</Text>
        </TouchableOpacity>
      </View>

      {/* Items link */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Items')}
        activeOpacity={0.85}
        style={{ backgroundColor: F.cream, borderRadius: 20, padding: 18, marginBottom: 16,
          flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <Text style={{ fontSize: 28 }}>📈</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: F.ink, fontWeight: '500' }}>Track items</Text>
          <Text style={{ fontSize: 12, color: F.ink2 }}>Per-unit price trends from scanned receipts</Text>
        </View>
        <Text style={{ fontSize: 18, color: F.ink3 }}>›</Text>
      </TouchableOpacity>

      {trend.length > 0 && (
        <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 18,
          borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontSize: 16, color: F.ink }}>{trend.length}-month trend</Text>
            {headerDelta !== null && (
              <View style={{ backgroundColor: headerDelta.pct <= 0 ? F.mint : '#fde2dc',
                borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: headerDelta.pct <= 0 ? F.sageD : F.coral, fontSize: 11, fontWeight: '600' }}>
                  {headerDelta.pct <= 0 ? '↓' : '↑'} {Math.abs(headerDelta.pct).toFixed(0)}% vs {headerAnchorLabel || 'prev'}
                </Text>
              </View>
            )}
          </View>

          {selectedMonth !== null && trend[selectedMonth] && (
            <View style={{ backgroundColor: F.cream, borderRadius: 12, padding: 10,
              marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: F.ink2 }}>{trend[selectedMonth].full}</Text>
              <Text style={{ fontSize: 20, color: F.coral, fontWeight: '600' }}>
                {sym}{Math.round(trend[selectedMonth].v).toLocaleString()}
              </Text>
            </View>
          )}

          <TrendChart
            chartId="trends.monthTrend"
            series={trendSeries}
            allow={['bar', 'line', 'area', 'dot']}
            defaultType="bar"
            height={120}
            color={F.coral}
            highlightColor={F.sageD}
            highlightKey={anchorMonth}
            selectedIndex={selectedMonth}
            onSelectIndex={(i) => setSelectedMonth(i)}
            showInspectLabel={false}
            formatValue={(v) => `${sym}${Math.round(v).toLocaleString()}`}
          />
          {trend.length > 12 && (
            <Text style={{ fontSize: 10, color: F.ink3, textAlign: 'center', marginTop: 6 }}>
              {trend[0]?.full} → {trend[trend.length - 1]?.full}
            </Text>
          )}
        </View>
      )}

      {goals.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between',
            alignItems: 'baseline', marginBottom: 12 }}>
            <Text style={{ fontSize: 19, color: F.ink }}>Goals in flight</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Goals')} activeOpacity={0.7}>
              <Text style={{ fontSize: 13, color: F.coral, fontWeight: '600' }}>manage all</Text>
            </TouchableOpacity>
          </View>

          {goals.slice(0, 3).map((g, i) => {
            const pct = g.target_amount > 0 ? g.saved_amount / g.target_amount : 0;
            const colors = [F.coral, F.sageD, F.sky2];
            const bgs    = [F.cream, F.mint, F.sky];

            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => navigation.navigate('Goals')}
                activeOpacity={0.75}
                style={{ backgroundColor: bgs[i % 3], borderRadius: 20, padding: 18,
                  marginBottom: 10 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 28 }}>{g.emoji}</Text>
                    <View>
                      <Text style={{ fontSize: 16, color: F.ink, fontWeight: '500' }}>{g.name}</Text>
                      {g.eta && <Text style={{ fontSize: 12, color: F.ink3 }}>ETA: {g.eta}</Text>}
                    </View>
                  </View>
                  <Text style={{ fontSize: 24, color: colors[i % 3], fontWeight: '600' }}>
                    {Math.round(pct * 100)}%
                  </Text>
                </View>

                <ProgressBar value={g.saved_amount} max={g.target_amount} color={colors[i % 3]} F={F} height={8}/>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

export default React.memo(withProfiler('Trends', Trends));
