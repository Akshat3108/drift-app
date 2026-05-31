// PS-43 — Income source breakdown.
//
// Two views over income.source: an active-month donut (with a legend of
// per-source amounts + share) and a trailing 12-month stacked bar (one stack
// segment per source). Both read income/repo's bySource* aggregates; no rollup
// table — the GROUP BY over a single-user income table is cheap.
//
// react-native-svg is loaded with the same lazy-require fallback used by
// NetWorth / MoneyFlow / MoodSpend; when it's unavailable the donut degrades to
// a horizontal proportion bar so the screen still renders.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useSettings } from '@features/profile/settings.context';
import { palette } from '../../../theme';
import { income as incomeRepo } from '../repo';
import CompositionChart from '@components/charts/CompositionChart';

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const monthLetter = (mk) => {
  const m = Number(String(mk).slice(5, 7));
  return m >= 1 && m <= 12 ? MONTH_LETTERS[m - 1] : '?';
};
const fmt = (n, sym) => `${sym}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

function IncomeBreakdown() {
  const { F } = useTheme();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();
  const monthKey = new Date().toISOString().slice(0, 7);

  const [loading, setLoading] = useState(true);
  const [bySource, setBySource] = useState([]);
  const [trend, setTrend] = useState([]);
  const [sourceCount, setSourceCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [bs, tr, sc] = await Promise.all([
      incomeRepo.bySource({ month: monthKey }),
      incomeRepo.bySourceTrend({ months: 11 }),
      incomeRepo.sourceCount(),
    ]);
    setBySource(bs); setTrend(tr); setSourceCount(sc); setLoading(false);
  }, [monthKey]);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={F.coral} />
      </View>
    );
  }

  // Readiness gate (PS-43): the mix view only makes sense with a few sources.
  if (sourceCount < 3) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>💵</Text>
        <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600', textAlign: 'center', marginBottom: 6 }}>
          Not enough income sources yet
        </Text>
        <Text style={{ fontSize: 13, color: F.ink3, textAlign: 'center' }}>
          Log income from at least 3 different sources (salary, freelance, dividends, rent…) to see your mix.
        </Text>
      </View>
    );
  }

  const paletteArr = palette(F);
  // Stable colour per source: union of active-month sources (desc) then any
  // trend-only sources, indexed into the palette and cycled.
  const allSources = [];
  for (const r of bySource) if (!allSources.includes(r.source)) allSources.push(r.source);
  for (const r of trend) if (!allSources.includes(r.source)) allSources.push(r.source);
  const colorOf = (src) => paletteArr[allSources.indexOf(src) % paletteArr.length];

  const monthTotal = bySource.reduce((a, r) => a + (Number(r.total) || 0), 0);
  const segments = bySource.map((r) => ({
    source: r.source,
    total: Number(r.total) || 0,
    frac: monthTotal > 0 ? (Number(r.total) || 0) / monthTotal : 0,
    color: colorOf(r.source),
  }));

  // Pivot trend rows into per-month source maps.
  const monthMap = new Map(); // month_key -> { source -> total }
  for (const r of trend) {
    if (!monthMap.has(r.month_key)) monthMap.set(r.month_key, {});
    monthMap.get(r.month_key)[r.source] = Number(r.total) || 0;
  }
  const months = [...monthMap.keys()].sort();
  const monthSums = months.map((mk) => Object.values(monthMap.get(mk)).reduce((a, b) => a + b, 0));
  const maxMonthSum = Math.max(1, ...monthSums);
  const BAR_H = 132;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 60, paddingHorizontal: 20 }}>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 12 }}>This month</Text>

      {monthTotal <= 0 ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line,
          padding: 20, marginBottom: 24 }}>
          <Text style={{ fontSize: 13, color: F.ink3 }}>No income recorded this month.</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line,
          padding: 16, marginBottom: 24, alignItems: 'center' }}>
          <CompositionChart
            chartId="income.sourceMix"
            segments={segments.map((s) => ({ label: s.source, value: s.total, color: s.color, key: s.source }))}
            allow={['donut', 'bar']}
            defaultType="donut"
            centerLabel="This month"
            centerValue={fmt(monthTotal, sym)}
          />
          <View style={{ width: '100%', marginTop: 16, gap: 8 }}>
            {segments.map((s) => (
              <View key={s.source} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color }} />
                <Text style={{ flex: 1, fontSize: 14, color: F.ink }} numberOfLines={1}>{s.source}</Text>
                <Text style={{ fontSize: 13, color: F.ink2, fontWeight: '600' }}>{fmt(s.total, sym)}</Text>
                <Text style={{ fontSize: 12, color: F.ink3, width: 42, textAlign: 'right' }}>
                  {Math.round(s.frac * 100)}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 12 }}>Last 12 months</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line,
        padding: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: BAR_H, gap: 4 }}>
          {months.map((mk) => {
            const sources = monthMap.get(mk);
            return (
              <View key={mk} style={{ flex: 1, height: BAR_H, justifyContent: 'flex-end' }}>
                {allSources.map((src) => {
                  const v = sources[src] || 0;
                  if (v <= 0) return null;
                  return (
                    <View key={src}
                      style={{ height: (v / maxMonthSum) * BAR_H, backgroundColor: colorOf(src) }} />
                  );
                })}
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
          {months.map((mk) => (
            <Text key={mk} style={{ flex: 1, fontSize: 9, color: F.ink3, textAlign: 'center' }}>
              {monthLetter(mk)}
            </Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

export default React.memo(IncomeBreakdown);
