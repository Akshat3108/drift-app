// 6.19 — Category variance heatmap.
//
// Reads `categoryVarianceMatrix({months})` (6.11). Rendered as an SVG grid
// where each cell colour-codes `monthly[m] / max_value_for_row`. cv badge
// per row gives an at-a-glance "volatility score". Tap a category row to
// drill into PotDetail; tap a single cell to highlight the column and
// show a per-cell callout.
//
// SVG is lazy-required so the dev shell without a native rebuild falls
// back to a plain Text empty-state rather than crashing.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { categoryVarianceMatrix, categoryCashflowForecast } from '../../../analytics';

let Svg = null, Rect = null, Line = null, SvgText = null;
try {
  const mod = require('react-native-svg');
  Svg     = mod.Svg     ?? mod.default;
  Rect    = mod.Rect;
  Line    = mod.Line;
  SvgText = mod.Text;
} catch (_) { /* dev shell without native rebuild — heatmap renders as fallback */ }

const RANGES = [
  { key: '3',  label: '3 mo',  months: 3 },
  { key: '6',  label: '6 mo',  months: 6 },
  { key: '12', label: '12 mo', months: 12 },
];

function intensityHex(F, t) {
  // Map [0..1] → a coral tint by interpolating between F.cream-ish and F.coral.
  // Returns rgb() with explicit channels so SVG accepts it without theme lookup.
  const v = Math.max(0, Math.min(1, t));
  // Cream baseline (#f4ece2) → coral peak (#f08672)
  const r = Math.round(244 + (240 - 244) * v);
  const g = Math.round(236 + (134 - 236) * v);
  const b = Math.round(226 + (114 - 226) * v);
  return `rgb(${r},${g},${b})`;
}

function shortMonth(monthKey) {
  if (!monthKey || !monthKey.includes('-')) return '';
  return monthKey.slice(5); // 'MM' — fits the cell label
}

function Variance({ navigation }) {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();

  const [rangeKey, setRangeKey] = useState('6');
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null); // {row, col, value, monthKey}
  // PS-28 — per-category month-end projection keyed by category id, loaded in
  // parallel for the "proj" column. Cached (FORECAST scope) so this is cheap
  // after the first paint.
  const [forecasts, setForecasts] = useState({});

  const load = useCallback(async () => {
    const months = RANGES.find((r) => r.key === rangeKey)?.months ?? 6;
    const res = await categoryVarianceMatrix({ months });
    setData(res);
    setSelected(null);
    if (res?.ready) {
      const ids = res.categories.map((c) => c.id).filter((id) => id != null);
      const results = await Promise.all(ids.map((id) => categoryCashflowForecast(id).catch(() => null)));
      const map = {};
      ids.forEach((id, i) => { if (results[i]?.ready) map[id] = results[i]; });
      setForecasts(map);
    } else {
      setForecasts({});
    }
  }, [rangeKey]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Pre-compute per-row max for intensity normalisation.
  const rows = useMemo(() => {
    if (!data?.ready) return [];
    return data.categories.map((c) => ({
      ...c,
      cells: data.months.map((mk) => ({
        month_key: mk,
        value: c.monthly[mk] ?? 0,
      })),
      rowMax: Math.max(...data.months.map((mk) => c.monthly[mk] ?? 0), 1),
    }));
  }, [data]);

  const monthCount = data?.months?.length ?? 0;
  const CELL_GAP = 3;
  const ROW_HEIGHT = 30;
  const LABEL_WIDTH = 92;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Category <Text style={{ color: F.coral, fontStyle: 'italic' }}>variance</Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6, lineHeight: 17 }}>
          How wobbly each pot is month-to-month. The cv badge is the coefficient
          of variation (stddev / mean) — a category fluctuating 30% reads ~0.3
          regardless of magnitude.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {RANGES.map((r) => {
          const sel = rangeKey === r.key;
          return (
            <TouchableOpacity key={r.key} onPress={() => setRangeKey(r.key)}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Window ${r.label}`}
              accessibilityState={{ selected: sel }}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 99,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line, alignItems: 'center' }}>
              <Text style={{ color: sel ? '#fff' : F.ink2, fontWeight: sel ? '700' : '500', fontSize: 12 }}>
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!data ? (
        <Text style={{ textAlign: 'center', color: F.ink3, padding: 40 }}>Loading…</Text>
      ) : !data.ready ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24,
          borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 10 }}>📐</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>No data in this window</Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 6, textAlign: 'center' }}>
            Log some spending and check back in a couple of months.
          </Text>
        </View>
      ) : (
        <>
          {selected && (
            <View style={{ backgroundColor: F.surface, borderRadius: 12,
              padding: 12, marginBottom: 12, borderWidth: 1, borderColor: F.line,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
                  {selected.categoryName}
                </Text>
                <Text style={{ fontSize: 11, color: F.ink3 }}>{selected.month_key}</Text>
              </View>
              <Text style={{ fontSize: 16, color: F.coral, fontWeight: '700' }}>
                {sym}{Number(selected.value).toFixed(0)}
              </Text>
            </View>
          )}

          {/* Month label row */}
          <View style={{ flexDirection: 'row', marginBottom: 6, paddingLeft: LABEL_WIDTH }}>
            {data.months.map((mk) => (
              <Text key={mk} style={{
                flex: 1, fontSize: 9, color: F.ink3, textAlign: 'center',
              }}>{shortMonth(mk)}</Text>
            ))}
            <View style={{ width: 52, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9, color: F.ink3 }}>proj</Text>
            </View>{/* PS-28 — projected month-end column */}
            <View style={{ width: 40 }}/>{/* spacer for cv column */}
          </View>

          {/* Grid */}
          <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 12,
            borderWidth: 1, borderColor: F.line }}>
            {rows.map((row, rIdx) => (
              <TouchableOpacity key={row.id ?? `unc-${rIdx}`}
                activeOpacity={0.85}
                onPress={() => row.id ? navigation.navigate('PotDetail', {
                  potId: row.id, potName: `${row.emoji} ${row.name}`,
                }) : null}
                style={{ flexDirection: 'row', alignItems: 'center',
                  marginBottom: rIdx === rows.length - 1 ? 0 : 6 }}>
                <View style={{ width: LABEL_WIDTH, flexDirection: 'row',
                  alignItems: 'center', gap: 5, paddingRight: 6 }}>
                  <Text style={{ fontSize: 14 }}>{row.emoji}</Text>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: F.ink, fontWeight: '500' }}>
                    {row.name}
                  </Text>
                </View>

                {/* Cells */}
                {Svg && Rect ? (
                  <View style={{ flex: 1, height: ROW_HEIGHT, flexDirection: 'row', gap: CELL_GAP }}>
                    {row.cells.map((cell, cIdx) => {
                      const t = row.rowMax > 0 ? cell.value / row.rowMax : 0;
                      const isSel = selected && selected.rowId === row.id && selected.month_key === cell.month_key;
                      return (
                        <TouchableOpacity
                          key={cell.month_key}
                          onPress={() => setSelected({
                            rowId: row.id, categoryName: row.name,
                            month_key: cell.month_key, value: cell.value,
                          })}
                          activeOpacity={0.7}
                          style={{ flex: 1, borderRadius: 4,
                            backgroundColor: intensityHex(F, t),
                            borderWidth: isSel ? 2 : 0, borderColor: F.coral }}/>
                      );
                    })}
                  </View>
                ) : (
                  <View style={{ flex: 1, height: ROW_HEIGHT, flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: F.cream, borderRadius: 4 }}>
                    <Text style={{ fontSize: 9, color: F.ink3 }}>rebuild needed</Text>
                  </View>
                )}

                {/* PS-28 — projected month-end (forecast vs actual). Tinted
                    coral when projected over budget, sage when under. */}
                {(() => {
                  const fc = row.id != null ? forecasts[row.id] : null;
                  const tint = fc?.projected_vs_budget == null ? F.ink2
                    : fc.projected_vs_budget > 0 ? F.coral : F.sageD;
                  return (
                    <View style={{ width: 52, alignItems: 'flex-end', paddingLeft: 6 }}>
                      <Text style={{ fontSize: 10, color: tint, fontWeight: '600' }}>
                        {fc?.ready ? abbrMoney(sym, fc.ensemble) : '—'}
                      </Text>
                    </View>
                  );
                })()}

                {/* cv badge */}
                <View style={{ width: 40, alignItems: 'flex-end', paddingLeft: 6 }}>
                  <Text style={{ fontSize: 10, color: cvColor(row.cv, F), fontWeight: '700' }}>
                    {row.cv == null ? '—' : row.cv.toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 10, color: F.ink3, marginTop: 12, textAlign: 'center', lineHeight: 14 }}>
            Each row scales to its own peak — colour intensity compares within a category,{'\n'}
            not across them. cv &lt; 0.20 is stable, 0.20–0.50 normal, &gt; 0.50 volatile.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

// Compact Indian-grouped money for the narrow proj column (₹12.3k / ₹1.2L).
function abbrMoney(sym, n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 100000) return `${sym}${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `${sym}${(v / 1000).toFixed(1)}k`;
  return `${sym}${v}`;
}

function cvColor(cv, F) {
  if (cv == null) return F.ink3;
  if (cv < 0.20) return F.sageD;
  if (cv < 0.50) return F.ink2;
  return F.coral;
}

export default React.memo(Variance);
