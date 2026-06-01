// PS-47 — Multi-month side-by-side comparison.
//
// Pick any 3 months; see each category's spend in all three with a per-row Δ
// (latest vs middle = MoM, latest vs first). Reuses summaryByCategory (one
// call per month) + the exported monthDelta — zero new SQL, all from
// monthly_summary.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useSettings } from '@features/profile/settings.context';
import { expenses as expRepo } from '@features/expenses/repo';
import { MonthPicker, currentMonthKey, formatMonthLabel } from '@components/primitives/MonthPicker';
import { monthDelta } from './Trends';

const fmt = (n, sym) => `${sym}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

function shiftMonth(mk, delta) {
  const [y, m] = String(mk).split('-').map((n) => parseInt(n, 10));
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const BAR_COLORS = ['#c9b89a', '#9ec3b0', '#e88373']; // first → latest

function DeltaPill({ info, label, F }) {
  if (!info) return null;
  const up = info.pct > 0.5;
  const flat = !up && info.pct >= -0.5;
  const color = flat ? F.ink3 : up ? F.coral : F.sageD;
  return (
    <Text style={{ fontSize: 10, color, fontWeight: '600' }}>
      {flat ? '·' : up ? '↑' : '↓'}{Math.abs(info.pct).toFixed(0)}% {label}
    </Text>
  );
}

function CompareMonths() {
  const { F } = useTheme();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();

  const now = useMemo(() => currentMonthKey(), []);
  const [months, setMonths] = useState(() => [shiftMonth(now, -2), shiftMonth(now, -1), now]);
  const [pickerIdx, setPickerIdx] = useState(null); // 0|1|2|null
  const [byMonth, setByMonth] = useState([new Map(), new Map(), new Map()]);

  const load = useCallback(async () => {
    const results = await Promise.all(months.map((mk) => expRepo.summaryByCategory(mk).catch(() => [])));
    setByMonth(results.map((rows) => {
      const map = new Map();
      for (const r of rows) map.set(r.id, { name: r.name, emoji: r.emoji, spent: Number(r.spent) || 0 });
      return map;
    }));
  }, [months]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const ids = new Set();
    byMonth.forEach((m) => m.forEach((v, id) => { if (v.spent > 0) ids.add(id); }));
    const out = [];
    for (const id of ids) {
      const meta = byMonth.find((m) => m.has(id))?.get(id) || { name: '?', emoji: '•' };
      const vals = byMonth.map((m) => m.get(id)?.spent || 0);
      out.push({ id, name: meta.name, emoji: meta.emoji, vals, sum: vals.reduce((s, v) => s + v, 0) });
    }
    out.sort((a, b) => b.vals[2] - a.vals[2] || b.sum - a.sum);
    return out;
  }, [byMonth]);

  const globalMax = useMemo(
    () => rows.reduce((mx, r) => Math.max(mx, ...r.vals), 1),
    [rows],
  );
  const totals = useMemo(
    () => months.map((_, i) => rows.reduce((s, r) => s + r.vals[i], 0)),
    [rows, months],
  );

  const setMonth = (mk) => {
    setMonths((prev) => {
      const next = [...prev];
      next[pickerIdx] = mk;
      return next;
    });
    setPickerIdx(null);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      {/* 3 month pickers */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {months.map((mk, i) => (
          <TouchableOpacity key={i} onPress={() => setPickerIdx(i)} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={`Pick month ${i + 1}`}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
              backgroundColor: F.surface, borderWidth: 1, borderColor: F.line }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BAR_COLORS[i], marginBottom: 4 }} />
            <Text style={{ fontSize: 12, color: F.ink, fontWeight: '600' }}>{formatMonthLabel(mk)} ▾</Text>
            <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>{fmt(totals[i], sym)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 16 }}>
        Δ columns compare the {formatMonthLabel(months[2])} column vs the other two.
      </Text>

      {rows.length === 0 ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 40, alignItems: 'center',
          borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📊</Text>
          <Text style={{ fontSize: 14, color: F.ink2 }}>No spending in these months</Text>
        </View>
      ) : rows.map((r) => {
        const dMoM = monthDelta(r.vals[2], r.vals[1]); // vs middle
        const dFirst = monthDelta(r.vals[2], r.vals[0]); // vs first
        return (
          <View key={r.id} style={{ backgroundColor: F.surface, borderRadius: 14, borderWidth: 1,
            borderColor: F.line, padding: 14, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>{r.emoji}</Text>
              <Text style={{ flex: 1, fontSize: 14, color: F.ink, fontWeight: '600' }} numberOfLines={1}>{r.name}</Text>
              <View style={{ alignItems: 'flex-end', gap: 1 }}>
                <DeltaPill info={dMoM} label={`vs ${formatMonthLabel(months[1])}`} F={F} />
                <DeltaPill info={dFirst} label={`vs ${formatMonthLabel(months[0])}`} F={F} />
              </View>
            </View>
            {r.vals.map((v, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: i < 2 ? 5 : 0 }}>
                <Text style={{ width: 34, fontSize: 10, color: F.ink3 }}>{formatMonthLabel(months[i]).slice(0, 3)}</Text>
                <View style={{ flex: 1, height: 8, backgroundColor: F.line, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: BAR_COLORS[i],
                    width: `${Math.max(2, (v / globalMax) * 100)}%` }} />
                </View>
                <Text style={{ width: 64, fontSize: 11, color: F.ink2, textAlign: 'right' }}>{fmt(v, sym)}</Text>
              </View>
            ))}
          </View>
        );
      })}

      <MonthPicker
        visible={pickerIdx !== null}
        onClose={() => setPickerIdx(null)}
        value={pickerIdx !== null ? months[pickerIdx] : now}
        onChange={setMonth}
        F={F}/>
    </ScrollView>
  );
}

export default React.memo(CompareMonths);
