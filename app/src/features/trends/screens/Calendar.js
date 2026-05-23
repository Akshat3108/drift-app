// 6.18 — Spending calendar.
//
// Three stacked sections, all driven by the 6.10 engine queries:
//   1. 12-cell month-of-year heatmap (4-wide × 3-tall grid), 36-month window.
//   2. 7-cell weekday strip (Sun..Sat), 12-month window.
//   3. 31-bar day-of-month histogram, 12-month window.
//
// Sections 1 + 2 are colour-intensity heatmaps; section 3 is a vertical-bar
// histogram (intensity = txn frequency).

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import {
  seasonalCalendar, dayOfWeekPattern, dayOfMonthHistogram,
} from '../../../analytics';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function intensityHex(t) {
  const v = Math.max(0, Math.min(1, t));
  const r = Math.round(244 + (240 - 244) * v);
  const g = Math.round(236 + (134 - 236) * v);
  const b = Math.round(226 + (114 - 226) * v);
  return `rgb(${r},${g},${b})`;
}

function MonthGrid({ data, F, sym }) {
  if (!data?.ready) {
    return (
      <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 20,
        borderWidth: 1, borderColor: F.line, alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
          Month-of-year heatmap
        </Text>
        <Text style={{ fontSize: 11, color: F.ink3, marginTop: 6, textAlign: 'center' }}>
          {data?.months_available != null
            ? `Need ≥ ${data.months_required} months — you have ${data.months_available}. Come back later.`
            : 'Need ≥ 12 months of history. Come back later.'}
        </Text>
      </View>
    );
  }
  const max = data.max_avg || 1;
  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 14,
      borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
      <Text style={{ fontSize: 12, color: F.ink2, marginBottom: 10 }}>
        Month-of-year average ({data.months_window}-month window)
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {data.cells.map((c) => {
          const t = c.avg_spend != null ? c.avg_spend / max : 0;
          const has = c.avg_spend != null;
          return (
            <View key={c.month}
              style={{
                width: '23%',
                aspectRatio: 1.6,
                borderRadius: 8,
                backgroundColor: has ? intensityHex(t) : F.cream,
                padding: 6,
                justifyContent: 'space-between',
                opacity: has ? 1 : 0.5,
              }}>
              <Text style={{ fontSize: 10, color: F.ink, fontWeight: '700' }}>
                {MONTHS[c.month - 1]}
              </Text>
              <Text style={{ fontSize: 11, color: t > 0.6 ? '#fff' : F.ink, fontWeight: '600' }}>
                {has ? `${sym}${Math.round(c.avg_spend).toLocaleString()}` : '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function WeekdayStrip({ data, F, sym }) {
  if (!data?.ready) {
    return (
      <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 20,
        borderWidth: 1, borderColor: F.line, alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>Weekday pattern</Text>
        <Text style={{ fontSize: 11, color: F.ink3, marginTop: 6 }}>No data yet</Text>
      </View>
    );
  }
  const max = data.max_avg || 1;
  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 14,
      borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
      <Text style={{ fontSize: 12, color: F.ink2, marginBottom: 10 }}>
        Average spend per weekday ({data.months_window}-month window)
      </Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {data.days.map((d) => {
          const t = max > 0 ? d.avg_spend / max : 0;
          return (
            <View key={d.dow} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={{
                width: '100%', aspectRatio: 1,
                borderRadius: 8, backgroundColor: intensityHex(t),
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Text style={{ fontSize: 9, color: t > 0.6 ? '#fff' : F.ink, fontWeight: '700' }}>
                  {sym}{Math.round(d.avg_spend / 100) / 10}k
                </Text>
              </View>
              <Text style={{ fontSize: 10, color: F.ink3 }}>{WEEKDAYS[d.dow]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DayOfMonthHistogram({ data, F }) {
  if (!data?.ready) {
    return (
      <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 20,
        borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>Day-of-month histogram</Text>
        <Text style={{ fontSize: 11, color: F.ink3, marginTop: 6 }}>No data yet</Text>
      </View>
    );
  }
  const max = data.max_txn_count || 1;
  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 14,
      borderWidth: 1, borderColor: F.line }}>
      <Text style={{ fontSize: 12, color: F.ink2, marginBottom: 10 }}>
        Transaction count by day of month ({data.months_window}-month window)
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 1 }}>
        {data.days.map((d) => {
          const h = max > 0 ? (d.txn_count / max) * 76 : 0;
          return (
            <View key={d.dom} style={{ flex: 1, alignItems: 'center', height: 80,
              justifyContent: 'flex-end' }}>
              <View style={{
                width: '100%', height: Math.max(2, h),
                backgroundColor: d.txn_count > 0 ? F.coral : F.cream,
                borderRadius: 2,
                opacity: d.txn_count > 0 ? 0.8 : 1,
              }}/>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {[1, 8, 15, 22, 29].map((d) => (
          <Text key={d} style={{
            position: 'absolute', left: `${((d - 1) / 30) * 100}%`,
            fontSize: 9, color: F.ink3,
          }}>{d}</Text>
        ))}
      </View>
      <View style={{ height: 14 }}/>
    </View>
  );
}

function Calendar() {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();

  const [moy, setMoy] = useState(null);
  const [dow, setDow] = useState(null);
  const [dom, setDom] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      seasonalCalendar({ months: 36 }),
      dayOfWeekPattern({ months: 12 }),
      dayOfMonthHistogram({ months: 12 }),
    ]);
    setMoy(a); setDow(b); setDom(c);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Spending <Text style={{ color: F.coral, fontStyle: 'italic' }}>calendar</Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6, lineHeight: 17 }}>
          When you spend, not just how much. Heavier shading = bigger averages.
        </Text>
      </View>

      <MonthGrid     data={moy} F={F} sym={sym}/>
      <WeekdayStrip  data={dow} F={F} sym={sym}/>
      <DayOfMonthHistogram data={dom} F={F}/>
    </ScrollView>
  );
}

export default React.memo(Calendar);
