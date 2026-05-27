// PS-03 — Carbon dashboard.
//
// Reads `carbonDashboard({ months })`. Renders:
//   1. Header strip: this-month kg + tier label, YTD kg.
//   2. 12-month vertical bar chart (svg).
//   3. Top emitting categories (top 5 in the window, tap → PotDetail).
//   4. Top emitting items (proportional allocation from parent expense's
//      carbon; tap → ItemTrend if normalized_name routes there). A footnote
//      calls out the heuristic.
//
// Hidden from Hub when `settings.carbon_tracking` is off. Empty state when
// no carbon-stamped expenses exist in the window.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { carbonDashboard, carbonImpactLabel } from '../../../analytics';
import { palette, potBg } from '../../../theme';

let Svg = null, Rect = null, Line = null, SvgText = null;
try {
  const mod = require('react-native-svg');
  Svg     = mod.Svg     ?? mod.default;
  Rect    = mod.Rect;
  Line    = mod.Line;
  SvgText = mod.Text;
} catch (_) { /* dev shell */ }

const CHART_PAD = { left: 30, right: 12, top: 14, bottom: 30 };

// Pure layout helper for the monthly bar chart. Exported for /tmp/ validation.
//   trend: [{ month_key, kg }]
//   returns { bars: [{ x, y, w, h, label, kg }], yMax, padding }
export function barLayout(trend, width, height, opts = {}) {
  const pad = opts.padding ?? CHART_PAD;
  const usableW = width - pad.left - pad.right;
  const usableH = height - pad.top - pad.bottom;
  const slots = trend.length || 1;
  const yMax = Math.max(0.1, ...trend.map((m) => m.kg || 0)) * 1.1;
  const slotW = usableW / slots;
  const barW = Math.max(4, slotW * 0.6);

  const bars = trend.map((m, i) => {
    const cx = pad.left + slotW * (i + 0.5);
    const h = m.kg > 0 ? (m.kg / yMax) * usableH : 0;
    return {
      x: cx - barW / 2,
      y: pad.top + usableH - h,
      w: barW,
      h,
      label: m.month_key.slice(5),  // 'MM'
      monthKey: m.month_key,
      kg: m.kg,
    };
  });
  return { bars, yMax, padding: pad, usableH };
}

function fmtKg(kg) {
  if (kg == null || !Number.isFinite(kg)) return '0 kg';
  if (kg < 0.05) return '<0.1 kg';
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${kg.toFixed(2)} kg`;
}

function CarbonDashboard({ navigation }) {
  const { F, settings } = useApp();
  // The carbon dashboard is a 12-month trailing window anchored to "now";
  // PS-05's activeMonth doesn't apply (it's a single-month filter, not a
  // window offset). We intentionally do not pull it into this screen.
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const d = await carbonDashboard({ months: 12 }).catch(() => null);
    setData(d);
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const pal = useMemo(() => palette(F), [F]);
  const winW = Dimensions.get('window').width;
  const chartW = Math.max(280, winW - 32);
  const chartH = 180;
  const layout = useMemo(
    () => (data ? barLayout(data.monthlyTrend, chartW, chartH) : null),
    [data, chartW, chartH],
  );

  const trackingOff = !settings?.carbon_tracking;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}
    >
      <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
        Carbon <Text style={{ color: F.coral, fontStyle: 'italic' }}>footprint</Text>
      </Text>
      <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
        On-device estimate · category-weighted
      </Text>

      {trackingOff && (
        <View style={{ marginTop: 18, padding: 14, backgroundColor: F.cream, borderRadius: 14, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
            🌱 Carbon tracking is off
          </Text>
          <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
            Turn it on in Profile to stamp new expenses with CO₂. Existing rows still appear below.
          </Text>
        </View>
      )}

      {!data && (
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 18 }}>Loading…</Text>
      )}

      {data && !data.ready && !trackingOff && (
        <View style={{ marginTop: 24, padding: 20, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 32 }}>🌱</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600', marginTop: 8, textAlign: 'center' }}>
            Log a few expenses to see your footprint
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
            New expenses with carbon tracking on get a kg estimate at save time.
          </Text>
        </View>
      )}

      {data && data.ready && (
        <>
          {/* ── Header strip ──────────────────────────────────── */}
          <View style={{ marginTop: 14, padding: 14, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>This month</Text>
                <Text style={{ fontSize: 24, color: F.coral, fontWeight: '700', marginTop: 2 }}>
                  {fmtKg(data.monthCurrent.kg)}
                </Text>
                {carbonImpactLabel(data.monthCurrent.kg) ? (
                  <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>
                    {carbonImpactLabel(data.monthCurrent.kg)}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Year to date</Text>
                <Text style={{ fontSize: 24, color: F.ink, fontWeight: '700', marginTop: 2 }}>
                  {fmtKg(data.totalYTD)}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Monthly trend ─────────────────────────────────── */}
          {layout && (
            <View style={{ marginTop: 14, padding: 12, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
              <Text style={{ fontSize: 12, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                Monthly kg CO₂
              </Text>
              {Svg ? (
                <Svg width={chartW} height={chartH}>
                  <SvgText x={4} y={CHART_PAD.top + 4} fontSize="10" fill={F.ink3}>
                    {fmtKg(layout.yMax)}
                  </SvgText>
                  <SvgText x={4} y={chartH - CHART_PAD.bottom + 10} fontSize="10" fill={F.ink3}>0</SvgText>
                  <Line
                    x1={CHART_PAD.left} y1={chartH - CHART_PAD.bottom}
                    x2={chartW - CHART_PAD.right} y2={chartH - CHART_PAD.bottom}
                    stroke={F.line} strokeWidth={1}/>
                  {layout.bars.map((b, i) => (
                    b.h > 0 && (
                      <Rect key={`bar-${i}`} x={b.x} y={b.y} width={b.w} height={b.h}
                        fill={F.coral} opacity={0.85} rx={2}/>
                    )
                  ))}
                  {layout.bars.map((b, i) => (
                    (i % 3 === 0 || i === layout.bars.length - 1) && (
                      <SvgText key={`x-${i}`} x={b.x + b.w / 2}
                        y={chartH - 8} fontSize="9" fill={F.ink3} textAnchor="middle">
                        {b.label}
                      </SvgText>
                    )
                  ))}
                </Svg>
              ) : (
                <View>
                  {layout.bars.map((b) => (
                    <View key={b.monthKey} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ color: F.ink2 }}>{b.monthKey}</Text>
                      <Text style={{ color: F.ink }}>{fmtKg(b.kg)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── Top categories ────────────────────────────────── */}
          {data.topCategories.length > 0 && (
            <View style={{ marginTop: 14, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
              <Text style={{ fontSize: 12, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, padding: 12 }}>
                Top emitting categories
              </Text>
              {data.topCategories.map((c, i) => (
                <TouchableOpacity
                  key={`cat-${c.category_id}-${i}`}
                  onPress={() => c.category_id != null && navigation.navigate('PotDetail', { potId: c.category_id, potName: `${c.emoji} ${c.name}` })}
                  activeOpacity={c.category_id != null ? 0.7 : 1}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 12, paddingVertical: 12,
                    borderTopWidth: 1, borderTopColor: F.line }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.color ? potBg(F, c.color) : pal[i % pal.length], justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 16 }}>{c.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>{c.name}</Text>
                    <Text style={{ fontSize: 11, color: F.ink3 }}>
                      {Math.round(c.share * 100)}% of tracked footprint
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: F.coral, fontWeight: '700' }}>{fmtKg(c.kg)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Top items ─────────────────────────────────────── */}
          {data.topItems.length > 0 && (
            <View style={{ marginTop: 14, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
              <Text style={{ fontSize: 12, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, padding: 12, paddingBottom: 2 }}>
                Top emitting items
              </Text>
              <Text style={{ fontSize: 10, color: F.ink3, paddingHorizontal: 12, paddingBottom: 6 }}>
                Estimated by each item's amount share of its receipt's carbon.
              </Text>
              {data.topItems.map((it, i) => (
                <TouchableOpacity
                  key={`it-${it.item_id}`}
                  onPress={() => navigation.navigate('ItemTrend', { normalizedName: it.name, displayName: it.name })}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 12, paddingVertical: 10,
                    borderTopWidth: 1, borderTopColor: F.line }}>
                  <Text style={{ fontSize: 18 }}>🛒</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }} numberOfLines={1}>{it.name}</Text>
                    <Text style={{ fontSize: 11, color: F.ink3 }}>
                      from a ₹{Math.round(it.expenseAmount).toLocaleString()} receipt
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: F.coral, fontWeight: '700' }}>{fmtKg(it.kg)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={{ fontSize: 10, color: F.ink3, marginTop: 18, textAlign: 'center', lineHeight: 14 }}>
            Estimates use category-weighted kg-per-rupee factors.{'\n'}Not a substitute for a certified audit.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

export default React.memo(CarbonDashboard);
