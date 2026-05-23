// 6.16 — Forecast screen.
//
// Reads `cashflowForecast()` (6.9). Displays:
//   1. Hero: ensemble projection + confidence band + "₹X / day burn rate".
//   2. Three model pills (linear / historical / rolling) with deltas vs ensemble.
//   3. Confidence cone: SVG line of actual cumulative spend so far + dashed
//      extrapolation to ensemble at month-end + shaded band from range.min to
//      range.max. The band widens to the right because past spend is fixed
//      and only the future is uncertain — matches the "cone of uncertainty"
//      forecasting convention.
//
// Empty/gated states render per the 6.9 gate reasons.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { cashflowForecast } from '../../../analytics';

let Svg = null, Path = null, Line = null, Circle = null, SvgText = null;
try {
  const mod = require('react-native-svg');
  Svg     = mod.Svg     ?? mod.default;
  Path    = mod.Path;
  Line    = mod.Line;
  Circle  = mod.Circle;
  SvgText = mod.Text;
} catch (_) { /* dev shell — cone falls back to a numeric range strip */ }

// Pure helper — returns the chart polygon for the confidence cone given the
// forecast output. Exported for /tmp/ testing.
//
//   actualLine  = polyline from (1, 0) → (daysElapsed, currentSpend) — flat
//                 daily rate approximation, since we don't store daily totals
//                 in the forecast output (we'd need a second query — defer).
//   centerLine  = continuation from (daysElapsed, currentSpend) →
//                 (daysInMonth, ensemble), drawn dashed.
//   coneFill    = polygon between min-band and max-band, anchored at
//                 (daysElapsed, currentSpend) so width=0 at "today" and grows
//                 to (daysInMonth, max-currentSpend) etc.
export function coneGeometry(forecast, width, height, padding) {
  if (!forecast?.ready) return null;
  const { days_elapsed: e, days_in_month: m, current_spend: cs, ensemble, range } = forecast;
  const usableW = width - padding.left - padding.right;
  const usableH = height - padding.top - padding.bottom;
  const maxY = Math.max(ensemble, range.max, cs) * 1.05;
  if (maxY <= 0) return null;
  const x = (d) => padding.left + ((d - 1) / Math.max(1, m - 1)) * usableW;
  const y = (v) => padding.top + (1 - v / maxY) * usableH;

  const actual = [
    `M ${x(1).toFixed(1)} ${y(0).toFixed(1)}`,
    `L ${x(e).toFixed(1)} ${y(cs).toFixed(1)}`,
  ].join(' ');
  const center = [
    `M ${x(e).toFixed(1)} ${y(cs).toFixed(1)}`,
    `L ${x(m).toFixed(1)} ${y(ensemble).toFixed(1)}`,
  ].join(' ');

  // Cone polygon: from (e, cs) widen linearly to the min/max envelope at m.
  // Going forward (M >= e), value at day d:
  //   centerAtD = cs + (ensemble - cs) × (d - e) / (m - e)
  //   spreadAtD = (range.max - ensemble) × (d - e) / (m - e)   (upper)
  //               = (ensemble - range.min) × (d - e) / (m - e) (lower)
  // We just sample at d=e (width 0) and d=m (full spread) since the
  // boundary is linear.
  const upper = [
    `M ${x(e).toFixed(1)} ${y(cs).toFixed(1)}`,
    `L ${x(m).toFixed(1)} ${y(range.max).toFixed(1)}`,
    `L ${x(m).toFixed(1)} ${y(range.min).toFixed(1)}`,
    `Z`,
  ].join(' ');

  return { actual, center, cone: upper, maxY, x, y };
}

function Forecast() {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await cashflowForecast();
    setData(res);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const screenWidth = Dimensions.get('window').width;
  const CHART_W = screenWidth - 32 - 36;
  const CHART_H = 180;
  const PAD = { top: 14, right: 12, bottom: 28, left: 44 };
  const geo = useMemo(() => coneGeometry(data, CHART_W, CHART_H, PAD), [data, CHART_W]);

  const burnRate = data?.ready ? data.current_spend / Math.max(data.days_elapsed, 1) : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          End-of-month <Text style={{ color: F.coral, fontStyle: 'italic' }}>forecast</Text>
        </Text>
        {data?.ready ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
              <Text style={{ fontSize: 36, color: F.coral, fontWeight: '700' }}>
                {sym}{Math.round(data.ensemble).toLocaleString()}
              </Text>
              <ConfidenceBadge level={data.confidence} F={F}/>
            </View>
            <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6 }}>
              Range {sym}{Math.round(data.range.min).toLocaleString()} – {sym}{Math.round(data.range.max).toLocaleString()}{' '}
              · day {data.days_elapsed} of {data.days_in_month}
            </Text>
            {burnRate != null && (
              <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
                Burn rate: <Text style={{ color: F.coral, fontWeight: '700' }}>
                  {sym}{Math.round(burnRate)} / day
                </Text>
              </Text>
            )}
          </>
        ) : data ? (
          <Text style={{ fontSize: 12, color: F.ink2, marginTop: 8 }}>
            {gateMessage(data.reason)}
          </Text>
        ) : (
          <Text style={{ fontSize: 12, color: F.ink2, marginTop: 8 }}>Loading…</Text>
        )}
      </View>

      {data?.ready && (
        <>
          {/* Model strip */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <ModelPill label="Linear-weighted" value={data.models.linear}
              ensemble={data.ensemble} F={F} sym={sym}/>
            <ModelPill label="Historical" value={data.models.historical}
              ensemble={data.ensemble} F={F} sym={sym}/>
            <ModelPill label="Rolling 90d" value={data.models.rolling}
              ensemble={data.ensemble} F={F} sym={sym}/>
          </View>

          {/* Confidence cone */}
          <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 18,
            borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 12 }}>
              Cumulative spend — cone widens toward end-of-month uncertainty
            </Text>
            {Svg && Path && geo ? (
              <Svg width={CHART_W} height={CHART_H}>
                {/* Cone fill */}
                <Path d={geo.cone} fill={F.coral} fillOpacity={0.12} stroke="none"/>
                {/* Center extrapolation (dashed) */}
                <Path d={geo.center} stroke={F.coral} strokeWidth="2"
                  strokeDasharray="6,4" fill="none"/>
                {/* Actual cumulative (solid) */}
                <Path d={geo.actual} stroke={F.coral} strokeWidth="2.5" fill="none"/>
                {/* Today marker */}
                <Circle cx={geo.x(data.days_elapsed)} cy={geo.y(data.current_spend)}
                  r="5" fill={F.coral} stroke="#fff" strokeWidth="1.5"/>
                {/* End-of-month marker */}
                <Circle cx={geo.x(data.days_in_month)} cy={geo.y(data.ensemble)}
                  r="4" fill="#fff" stroke={F.coral} strokeWidth="2"/>

                {/* y-axis ticks */}
                {[0, 0.5, 1].map((t) => {
                  const v = geo.maxY * t;
                  return (
                    <React.Fragment key={t}>
                      <Line x1={PAD.left} y1={geo.y(v)} x2={CHART_W - PAD.right} y2={geo.y(v)}
                        stroke={F.line} strokeWidth="0.5"/>
                      <SvgText x={PAD.left - 6} y={geo.y(v) + 3} fontSize="9"
                        fill={F.ink3} textAnchor="end">
                        {sym}{(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k
                      </SvgText>
                    </React.Fragment>
                  );
                })}
                {/* x-axis labels */}
                <SvgText x={geo.x(1)} y={CHART_H - 8} fontSize="9" fill={F.ink3} textAnchor="middle">
                  d1
                </SvgText>
                <SvgText x={geo.x(data.days_elapsed)} y={CHART_H - 8} fontSize="9"
                  fill={F.coral} textAnchor="middle" fontWeight="700">
                  today (d{data.days_elapsed})
                </SvgText>
                <SvgText x={geo.x(data.days_in_month)} y={CHART_H - 8} fontSize="9"
                  fill={F.ink3} textAnchor="middle">
                  d{data.days_in_month}
                </SvgText>
              </Svg>
            ) : (
              <View>
                <Text style={{ fontSize: 12, color: F.ink2, marginBottom: 6 }}>Range</Text>
                <View style={{ height: 12, backgroundColor: F.cream, borderRadius: 6, marginBottom: 8 }}>
                  <View style={{
                    width: '100%', height: '100%',
                    backgroundColor: F.coral, opacity: 0.25, borderRadius: 6,
                  }}/>
                </View>
                <Text style={{ fontSize: 11, color: F.ink3, textAlign: 'center' }}>
                  Native rebuild needed for the SVG cone — meanwhile the numbers above are exact.
                </Text>
              </View>
            )}
          </View>

          {/* Methodology footnote */}
          <Text style={{ fontSize: 11, color: F.ink3, lineHeight: 16, textAlign: 'center' }}>
            Ensemble = mean of three models. Confidence band reflects model agreement —
            high means the three projections sit within 10% of each other, low means they
            disagree. The other two ensemble members (recurring-aware + day-of-week)
            ship in a later phase.
          </Text>
        </>
      )}

      {data && !data.ready && (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24,
          borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 10 }}>📈</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
            {gateHeadline(data.reason)}
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 6, textAlign: 'center' }}>
            {gateMessage(data.reason)}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function ModelPill({ label, value, ensemble, F, sym }) {
  const delta = value - ensemble;
  const pct = ensemble > 0 ? (delta / ensemble) * 100 : 0;
  const color = Math.abs(pct) < 5 ? F.ink3 : pct > 0 ? F.coral : F.sageD;
  return (
    <View style={{ flex: 1, backgroundColor: F.surface, borderRadius: 14,
      borderWidth: 1, borderColor: F.line, padding: 12, alignItems: 'center' }}>
      <Text style={{ fontSize: 9, color: F.ink3, textTransform: 'uppercase',
        letterSpacing: 0.6, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 15, color: F.ink, fontWeight: '700' }}>
        {sym}{Math.round(Number(value) || 0).toLocaleString()}
      </Text>
      <Text style={{ fontSize: 10, color, fontWeight: '600', marginTop: 2 }}>
        {pct > 0 ? '+' : ''}{pct.toFixed(0)}% vs ens.
      </Text>
    </View>
  );
}

function ConfidenceBadge({ level, F }) {
  const bg = level === 'high' ? F.mint : level === 'medium' ? F.cream : '#fde2dc';
  const fg = level === 'high' ? F.sageD : level === 'medium' ? F.ink : F.coral;
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, backgroundColor: bg }}>
      <Text style={{ fontSize: 10, color: fg, fontWeight: '700', textTransform: 'uppercase' }}>
        {level} confidence
      </Text>
    </View>
  );
}

function gateHeadline(reason) {
  switch (reason) {
    case 'no_expenses':          return 'No history yet';
    case 'insufficient_history': return 'A few more days of logging';
    case 'insufficient_month':   return 'Still early in the month';
    default:                     return 'Forecast unavailable';
  }
}
function gateMessage(reason) {
  switch (reason) {
    case 'no_expenses':          return 'Add a couple of spends and check back.';
    case 'insufficient_history': return 'Need at least 7 days of spend history before the projection becomes meaningful.';
    case 'insufficient_month':   return 'Forecast becomes accurate after a few days into the month.';
    default:                     return 'Come back later.';
  }
}

export default React.memo(Forecast);
