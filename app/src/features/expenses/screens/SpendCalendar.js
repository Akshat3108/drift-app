// 7.4 — Spending calendar (day grid).
//
// Month grid (Sun..Sat, 6 rows) where each in-month cell is intensity-shaded
// by the day's total spend. Tap a day to drill into a callout listing every
// expense logged that day (tap an expense row to navigate to Detail).
//
// Distinct from:
//   6.18 Calendar.js (trends/) — aggregate heatmaps over month-of-year /
//        weekday / day-of-month (averages across time periods, not per-day).
//   7.2 SubCalendar.js (subs/) — same month-grid idiom, subscription bills
//        only.
//
// Reuses the pure `monthGridCells / monthKeyOf / shiftMonth / SUB_CAL_*`
// helpers from `subs/projection.js`. Cross-feature import is intentional —
// hoisting them to `core/calendar/` is a follow-up when a third caller
// shows up (see Decision log).

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useExpenses } from '@features/expenses/context';
import { useSettings } from '@features/profile/settings.context';
import {
  monthGridCells,
  monthKeyOf,
  shiftMonth,
  SUB_CAL_MONTH_NAMES,
  SUB_CAL_WEEKDAY_HEAD,
} from '@features/subs/projection';
import { logError } from '@core/utils/log';
import { hourOfDayHistogram } from '../../../analytics';

const MAX_PAGE_BACK    = 24;  // 2 years of look-back
const MAX_PAGE_FORWARD = 1;   // back-dated entries can land in the next month
const PAGER_SPAN = 5;
const MIN_OPACITY = 0.12;     // so even a tiny day reads as a faint tint

function todayParts() {
  const d = new Date();
  return { year: d.getFullYear(), monthIndex: d.getMonth(), day: d.getDate() };
}

function dayIso(year, monthIndex, day) {
  const y = year;
  const m = String(monthIndex + 1).padStart(2, '0');
  const da = String(day).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

// Convert a 0..1 intensity into an rgba coral string. F.coral isn't always
// the same hex across themes, but the calendar reads it from the theme at
// render time so the alpha-overlay approach stays theme-consistent.
function coralAlpha(F, t) {
  // F.coral is the brand coral; render as rgba with the supplied alpha.
  // Quick parse — F.coral is always a hex like '#e88373' in this codebase.
  const hex = (F.coral || '#e88373').replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${t})`;
}

function PagerStrip({ offset, setOffset, F }) {
  const today = todayParts();
  let start = offset - Math.floor(PAGER_SPAN / 2);
  if (start < -MAX_PAGE_BACK) start = -MAX_PAGE_BACK;
  const end = Math.min(start + PAGER_SPAN - 1, MAX_PAGE_FORWARD);
  if (end - start < PAGER_SPAN - 1) start = end - (PAGER_SPAN - 1);
  const cells = [];
  for (let k = start; k <= end; k++) cells.push(k);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <TouchableOpacity
        onPress={() => setOffset(Math.max(-MAX_PAGE_BACK, offset - 1))}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
        <Text style={{ color: offset <= -MAX_PAGE_BACK ? F.ink3 : F.ink, fontSize: 18, fontWeight: '500' }}>‹</Text>
      </TouchableOpacity>
      <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
        {cells.map((k) => {
          const { year, monthIndex } = shiftMonth(today.year, today.monthIndex, k);
          const sel = k === offset;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setOffset(k)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Show ${SUB_CAL_MONTH_NAMES[monthIndex]} ${year}`}
              accessibilityState={{ selected: sel }}
              style={{
                flex: 1, paddingVertical: 6, borderRadius: 10,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
                alignItems: 'center',
              }}>
              <Text style={{ fontSize: 11, fontWeight: '700',
                color: sel ? '#fff' : F.ink, letterSpacing: 0.5 }}>
                {SUB_CAL_MONTH_NAMES[monthIndex].slice(0, 3)}
              </Text>
              <Text style={{ fontSize: 9, color: sel ? 'rgba(255,255,255,0.85)' : F.ink3 }}>
                {String(year).slice(-2)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        onPress={() => setOffset(Math.min(MAX_PAGE_FORWARD, offset + 1))}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Next month"
        style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
        <Text style={{ color: offset >= MAX_PAGE_FORWARD ? F.ink3 : F.ink, fontSize: 18, fontWeight: '500' }}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

function MonthGrid({ year, monthIndex, byDay, maxTotal, selectedDay, setSelectedDay, F }) {
  const today = todayParts();
  const grid = useMemo(() => monthGridCells(year, monthIndex), [year, monthIndex]);

  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18,
      borderWidth: 1, borderColor: F.line, padding: 12, marginBottom: 16 }}>

      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {SUB_CAL_WEEKDAY_HEAD.map((label, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: F.ink3, fontWeight: '700', letterSpacing: 0.5 }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {grid.cells.map((c, idx) => {
          if (!c.inMonth) {
            return <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}/>;
          }
          const entry      = byDay.get(c.day);
          const total      = entry?.total || 0;
          const hasSpend   = total > 0;
          const isToday    = today.year === year && today.monthIndex === monthIndex && today.day === c.day;
          const isSelected = selectedDay === c.day;

          // Intensity ramp clamped at MIN_OPACITY so non-zero days stay visible.
          const opacity = hasSpend && maxTotal > 0
            ? Math.max(MIN_OPACITY, total / maxTotal)
            : 0;
          const bg = isSelected
            ? F.coral
            : hasSpend ? coralAlpha(F, opacity) : F.surface;
          const dayColor = isSelected || opacity > 0.6 ? '#fff' : F.ink;
          const borderColor = isSelected
            ? F.coral
            : isToday ? F.coral : F.line;

          // PS-23 — no-spend mark. Only flag past-or-today days; future days
          // in the visible month aren't no-spend, they just haven't happened.
          // Uses the already-loaded `byDay` map (the absence of a key is the
          // signal) instead of a second SQL fetch via `noSpendDayMap`.
          const isPastOrToday = year < today.year
            || (year === today.year && (monthIndex < today.monthIndex
              || (monthIndex === today.monthIndex && c.day <= today.day)));
          const showNoSpendDot = !hasSpend && isPastOrToday && !isSelected;

          return (
            <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              <TouchableOpacity
                onPress={() => setSelectedDay(c.day)}
                activeOpacity={hasSpend ? 0.7 : 1}
                accessibilityRole="button"
                accessibilityLabel={`Day ${c.day}${hasSpend ? `, ${entry.txn_count} expense${entry.txn_count === 1 ? '' : 's'}` : (isPastOrToday ? ', no spend' : '')}`}
                accessibilityState={{ selected: isSelected }}
                style={{
                  flex: 1, borderRadius: 10,
                  backgroundColor: bg,
                  borderWidth: isToday || isSelected ? 1.5 : 1,
                  borderColor,
                  padding: 4,
                  justifyContent: 'flex-start',
                }}>
                <Text style={{ fontSize: 11, color: dayColor, fontWeight: isToday ? '700' : '500' }}>
                  {c.day}
                </Text>
                {showNoSpendDot && (
                  <Text style={{
                    position: 'absolute', bottom: 2, left: 0, right: 0,
                    textAlign: 'center',
                    fontSize: 10, color: F.sageD || F.ink3, fontWeight: '700',
                  }}>·</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SelectionCallout({ year, monthIndex, day, dayTotal, dayExpenses, loading, F, sym, navigation }) {
  if (!day) return null;
  const dateLabel = `${SUB_CAL_MONTH_NAMES[monthIndex].slice(0, 3)} ${day}`;
  if (loading) {
    return (
      <View style={{ backgroundColor: F.surface, borderRadius: 18,
        borderWidth: 1, borderColor: F.line, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, color: F.ink3 }}>{dateLabel}</Text>
        <Text style={{ fontSize: 14, color: F.ink2, marginTop: 4 }}>Loading…</Text>
      </View>
    );
  }
  if (!dayExpenses || dayExpenses.length === 0) {
    return (
      <View style={{ backgroundColor: F.surface, borderRadius: 18,
        borderWidth: 1, borderColor: F.line, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, color: F.ink3 }}>{dateLabel}</Text>
        <Text style={{ fontSize: 14, color: F.ink, marginTop: 4 }}>
          Nothing logged on this day.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18,
      borderWidth: 1, borderColor: F.line, padding: 14, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontSize: 15, color: F.ink, fontWeight: '600' }}>
          {dayExpenses.length} expense{dayExpenses.length === 1 ? '' : 's'} on {dateLabel}
        </Text>
        <Text style={{ fontSize: 13, color: F.coral, fontWeight: '700' }}>
          {sym}{(dayTotal || 0).toFixed(2)}
        </Text>
      </View>
      {dayExpenses.map((e, idx) => (
        <TouchableOpacity
          key={e.id}
          onPress={() => navigation.navigate('Detail', { id: e.id })}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingVertical: 10,
            borderTopWidth: idx === 0 ? 0 : 1,
            borderTopColor: F.line,
          }}>
          <View style={{
            width: 36, height: 36, borderRadius: 11,
            backgroundColor: e.category_color || F.cream,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 16 }}>{e.category_emoji || '💸'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>{e.merchant}</Text>
            <Text style={{ fontSize: 11, color: F.ink3 }}>
              {e.category_name || 'Uncategorised'}
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
            {sym}{(e.amount || 0).toFixed(2)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// PS-25 — Days / By hour segmented control.
function ViewModeTabs({ mode, setMode, F }) {
  const Tab = ({ value, label }) => {
    const sel = mode === value;
    return (
      <TouchableOpacity
        onPress={() => setMode(value)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: sel }}
        accessibilityLabel={`Show ${label}`}
        style={{
          flex: 1, paddingVertical: 8, borderRadius: 10,
          backgroundColor: sel ? F.coral : F.surface,
          borderWidth: 1, borderColor: sel ? F.coral : F.line,
          alignItems: 'center',
        }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? '#fff' : F.ink, letterSpacing: 0.5 }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
      <Tab value="days" label="DAYS"/>
      <Tab value="hour" label="BY HOUR"/>
    </View>
  );
}

// PS-25 — 24-cell horizontal heat strip. Reads `hourOfDayHistogram(monthKey)`.
// Below 50 timestamped expenses, renders an opt-in / keep-logging nudge
// instead of a misleading sparse pattern.
function HourHeatStrip({ monthKey, monthLabel, F, sym }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    hourOfDayHistogram({ monthKey })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { logError('spendcal:hourHistogram', e); if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [monthKey]);

  if (loading) {
    return (
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, padding: 16 }}>
        <Text style={{ fontSize: 12, color: F.ink3 }}>Loading hour-of-day pattern…</Text>
      </View>
    );
  }

  if (!data || !data.ready) {
    return (
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line,
        padding: 22, alignItems: 'center' }}>
        <Text style={{ fontSize: 32, marginBottom: 6 }}>🕐</Text>
        <Text style={{ fontSize: 14, color: F.ink2, textAlign: 'center' }}>
          Hour-of-day pattern needs 50+ timestamped expenses.
        </Text>
        <Text style={{ fontSize: 11, color: F.ink3, marginTop: 6, textAlign: 'center', lineHeight: 16 }}>
          Currently {data?.sample_size ?? 0}. Enable "Capture expense time" in Profile → General to start
          stamping new entries with their save time.
        </Text>
      </View>
    );
  }

  const maxTotal = Math.max(...data.buckets.map((b) => b.total), 1);
  const peak = data.peak_hour;

  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, padding: 16 }}>
      <Text style={{ fontSize: 12, color: F.ink3, fontWeight: '700', letterSpacing: 0.7, marginBottom: 8 }}>
        BY HOUR · {monthLabel.toUpperCase()}
      </Text>
      <Text style={{ fontSize: 13, color: F.ink, marginBottom: 14 }}>
        Peak hour: {peak != null ? `${String(peak).padStart(2, '0')}:00` : '—'}
        <Text style={{ color: F.ink3 }}> · from {data.sample_size} timestamped spends</Text>
      </Text>
      <View style={{ flexDirection: 'row', gap: 1 }}>
        {data.buckets.map((b) => {
          const intensity = b.total > 0 ? Math.max(0.1, b.total / maxTotal) : 0;
          return (
            <View key={b.hour} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{
                width: '100%', aspectRatio: 0.5,
                backgroundColor: intensity > 0 ? `rgba(232,131,115,${intensity})` : F.cream,
                borderRadius: 2,
                borderWidth: peak === b.hour ? 1.2 : 0,
                borderColor: F.coral,
              }}/>
              {b.hour % 6 === 0 && (
                <Text style={{ fontSize: 8, color: F.ink3, marginTop: 4 }}>
                  {String(b.hour).padStart(2, '0')}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {data.total > 0 && (
        <Text style={{ fontSize: 11, color: F.ink3, marginTop: 8 }}>
          Total {sym}{data.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} across the day
        </Text>
      )}
    </View>
  );
}

function SpendCalendar({ navigation }) {
  const { F } = useTheme();
  const { expenses, spendByDay, listByDate } = useExpenses();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();

  const [offset, setOffset] = useState(0);
  const today = useMemo(() => todayParts(), []);
  const { year, monthIndex } = useMemo(
    () => shiftMonth(today.year, today.monthIndex, offset),
    [today, offset],
  );
  const monthKey = useMemo(() => monthKeyOf(year, monthIndex), [year, monthIndex]);

  // The expenses array reference changes on every mutation (mutations re-run
  // refreshSummary which re-orders the in-memory feed). Using its length as a
  // dep gives us a cheap "data changed" signal without subscribing to every
  // slice property.
  const expensesGen = expenses.length;

  const [byDay, setByDay] = useState(new Map());
  const [maxTotal, setMaxTotal] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [totalForMonth, setTotalForMonth] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadMonth = useCallback(async () => {
    try {
      const rows = await spendByDay(monthKey);
      const m = new Map();
      let max = 0;
      let total = 0;
      let count = 0;
      for (const r of (rows || [])) {
        // expense_date is 'YYYY-MM-DD'; pull the day component.
        const day = Number((r.date || '').slice(8, 10));
        if (!Number.isFinite(day)) continue;
        m.set(day, { total: r.total || 0, txn_count: r.txn_count || 0 });
        if ((r.total || 0) > max) max = r.total;
        total += r.total || 0;
        count += r.txn_count || 0;
      }
      setByDay(m);
      setMaxTotal(max);
      setTotalForMonth(total);
      setEventCount(count);
    } catch (e) {
      logError('spendcal:load', e);
    }
  }, [spendByDay, monthKey]);

  useEffect(() => { loadMonth(); }, [loadMonth, expensesGen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadMonth(); } finally { setRefreshing(false); }
  }, [loadMonth]);

  // PS-25 — view mode toggle. 'days' = month grid (default); 'hour' = 24-cell strip.
  const [viewMode, setViewMode] = useState('days');

  // Auto-select today when viewing the current month; clear when paging away.
  const [selectedDay, setSelectedDay] = useState(null);
  useEffect(() => {
    if (offset === 0) setSelectedDay(today.day);
    else setSelectedDay(null);
  }, [offset, today.day]);

  // Per-day expense list for the callout. Re-fetched when the selected day
  // changes or the underlying expenses array mutates.
  const [dayExpenses, setDayExpenses] = useState([]);
  const [dayLoading, setDayLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!selectedDay) { setDayExpenses([]); return undefined; }
    const iso = dayIso(year, monthIndex, selectedDay);
    setDayLoading(true);
    listByDate(iso)
      .then((list) => { if (!cancelled) { setDayExpenses(list || []); setDayLoading(false); } })
      .catch((err) => {
        if (cancelled) return;
        logError('spendcal:list-day', err);
        setDayExpenses([]);
        setDayLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedDay, year, monthIndex, listByDate, expensesGen]);

  const dayTotal = selectedDay != null ? (byDay.get(selectedDay)?.total || 0) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Spending <Text style={{ color: F.coral, fontStyle: 'italic' }}>calendar</Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6, lineHeight: 17 }}>
          Where your money went this month. Tap a day to drill in.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 12 }}>
          <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>
            {sym}{totalForMonth.toFixed(2)}
          </Text>
          <Text style={{ fontSize: 12, color: F.ink2 }}>
            across {eventCount} expense{eventCount === 1 ? '' : 's'} in {SUB_CAL_MONTH_NAMES[monthIndex]}
          </Text>
        </View>
      </View>

      {/* PS-25 — segmented control (Days / By hour). Default is Days. */}
      <ViewModeTabs mode={viewMode} setMode={setViewMode} F={F}/>

      {viewMode === 'days' ? (
        <>
          <PagerStrip offset={offset} setOffset={setOffset} F={F}/>

          <MonthGrid
            year={year} monthIndex={monthIndex}
            byDay={byDay}
            maxTotal={maxTotal}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            F={F}/>

          <SelectionCallout
            year={year} monthIndex={monthIndex} day={selectedDay}
            dayTotal={dayTotal}
            dayExpenses={dayExpenses}
            loading={dayLoading}
            F={F} sym={sym} navigation={navigation}/>
        </>
      ) : (
        <HourHeatStrip monthKey={monthKey} monthLabel={SUB_CAL_MONTH_NAMES[monthIndex]} F={F} sym={sym}/>
      )}

      {viewMode === 'days' && byDay.size === 0 && !refreshing && (
        <View style={{ alignItems: 'center', padding: 32, backgroundColor: F.surface,
          borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 32, marginBottom: 6 }}>🗓️</Text>
          <Text style={{ fontSize: 14, color: F.ink2 }}>
            No spending in {SUB_CAL_MONTH_NAMES[monthIndex]} yet
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
            Tap + on the home screen to log your first expense.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

export default React.memo(SpendCalendar);
