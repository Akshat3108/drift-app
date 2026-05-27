// PS-02 — Mood × spend.
//
// Reads `moodAggregates({ months })`. Renders:
//   1. Header strip: n, window, classifier.
//   2. Bubble chart: X = mood (5 slots), Y = avg spend, bubble radius ∝ √count.
//      Low-confidence buckets (count<5) render at 35% opacity but stay visible.
//      `react-native-svg` with the same lazy-require fallback used elsewhere.
//   3. "Biggest mood deltas" callout list: top 5 (category, mood) cells by
//      |Δavg × n|, each tappable to PotDetail.
//
// Empty state when `!ready` (n<30 or fewer than 3 non-empty moods).

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { moodAggregates } from '../../../analytics';

let Svg = null, Circle = null, Line = null, SvgText = null;
try {
  const mod = require('react-native-svg');
  Svg     = mod.Svg     ?? mod.default;
  Circle  = mod.Circle;
  Line    = mod.Line;
  SvgText = mod.Text;
} catch (_) { /* dev shell — falls back to a numeric strip */ }

const CHART_PAD = { left: 30, right: 12, top: 16, bottom: 36 };
const MIN_R = 6;
const MAX_R = 28;

// Pure geometry helper. Exported for /tmp/ validation.
//
//   perMood: [{ mood, label, count, avg }]   (length 5)
//   width, height: outer SVG dims
//
// Returns:
//   { columns: [{ cx, cy, r, opacity, label, mood, count, avg }],
//     yMax, slots, padding }
export function bubbleLayout(perMood, width, height, opts = {}) {
  const pad = opts.padding ?? CHART_PAD;
  const slots = perMood.length;
  const usableW = width - pad.left - pad.right;
  const usableH = height - pad.top - pad.bottom;
  const yMax = Math.max(1, ...perMood.map((p) => p.avg || 0)) * 1.1;
  const maxCount = Math.max(1, ...perMood.map((p) => p.count || 0));

  const colX = (i) => pad.left + (usableW * (i + 0.5)) / slots;
  const ny = (v) => pad.top + (1 - v / yMax) * usableH;
  const radius = (count) => {
    if (!count) return 0;
    const f = Math.sqrt(count / maxCount);
    return Math.max(MIN_R, Math.min(MAX_R, MIN_R + f * (MAX_R - MIN_R)));
  };

  const columns = perMood.map((p, i) => ({
    cx: colX(i),
    cy: p.avg != null && p.avg > 0 ? ny(p.avg) : pad.top + usableH,
    r: radius(p.count),
    opacity: p.count >= 5 ? 1 : p.count > 0 ? 0.35 : 0,
    label: p.label,
    mood: p.mood,
    count: p.count,
    avg: p.avg,
  }));

  return { columns, yMax, slots, padding: pad };
}

function formatRupees(n, sym) {
  if (n == null) return `${sym}0`;
  const abs = Math.round(Math.abs(n));
  if (abs >= 1_00_000) return `${sym}${(n / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}k`;
  return `${sym}${abs}`;
}

function MoodSpend({ navigation, route }) {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();
  // Mood × spend is a trailing-window analytic — `activeMonth` doesn't apply
  // (the window is a count of months from today, not a specific month). Route
  // param override retained for deep-link parity with the other PS-* screens.
  const [months] = useState(() => route?.params?.months || 6);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const d = await moodAggregates({ months }).catch(() => null);
    setData(d);
  }, [months]);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const winW = Dimensions.get('window').width;
  const chartW = Math.max(280, winW - 32);
  const chartH = 220;
  const layout = useMemo(
    () => (data ? bubbleLayout(data.perMood, chartW, chartH) : null),
    [data, chartW, chartH],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}
    >
      <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
        Mood × <Text style={{ color: F.coral, fontStyle: 'italic' }}>spend</Text>
      </Text>
      <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
        Last {months} months {data ? `· ${data.n} mood-tagged spends` : ''}
      </Text>

      {!data && (
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 18 }}>Loading…</Text>
      )}

      {data && !data.ready && (
        <View style={{ marginTop: 24, padding: 20, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 32 }}>🎭</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600', marginTop: 8, textAlign: 'center' }}>
            Log a few expenses with mood to see patterns
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
            Needs at least 30 mood-tagged expenses across 3+ moods. You have {data.n} so far.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Add')}
            style={{ backgroundColor: F.coral, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginTop: 14 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Log a spend</Text>
          </TouchableOpacity>
        </View>
      )}

      {data && data.ready && layout && (
        <View style={{ marginTop: 18, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, padding: 12 }}>
          <Text style={{ fontSize: 12, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
            Avg spend by mood
          </Text>
          {Svg ? (
            <Svg width={chartW} height={chartH}>
              {/* y-axis labels */}
              <SvgText x={4} y={layout.padding.top + 4} fontSize="10" fill={F.ink3}>
                {formatRupees(layout.yMax, sym)}
              </SvgText>
              <SvgText x={4} y={chartH - layout.padding.bottom + 10} fontSize="10" fill={F.ink3}>
                {sym}0
              </SvgText>
              <Line
                x1={layout.padding.left} y1={chartH - layout.padding.bottom}
                x2={chartW - layout.padding.right} y2={chartH - layout.padding.bottom}
                stroke={F.line} strokeWidth={1}/>
              {/* bubbles */}
              {layout.columns.map((c, i) => (
                c.count > 0 && (
                  <Circle key={`b-${i}`} cx={c.cx} cy={c.cy} r={c.r}
                    fill={F.coral} opacity={c.opacity * 0.55}/>
                )
              ))}
              {/* mood emoji captions on the x-axis */}
              {layout.columns.map((c, i) => (
                <SvgText key={`x-${i}`} x={c.cx} y={chartH - 14}
                  fontSize="20" textAnchor="middle">
                  {c.mood}
                </SvgText>
              ))}
            </Svg>
          ) : (
            <View>
              {layout.columns.map((c) => (
                <View key={c.mood} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                  <Text>{c.mood} {c.label}</Text>
                  <Text style={{ color: F.ink2 }}>{c.count} · avg {formatRupees(c.avg, sym)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* legend / per-mood numbers */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 6 }}>
            {layout.columns.map((c) => (
              <View key={`pill-${c.mood}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: c.count > 0 ? F.cream : F.surface,
                  borderWidth: 1, borderColor: F.line,
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99,
                  opacity: c.opacity || 0.5 }}>
                <Text style={{ fontSize: 13 }}>{c.mood}</Text>
                <Text style={{ fontSize: 11, color: F.ink2 }}>
                  {c.count} · {c.avg != null ? formatRupees(c.avg, sym) : '—'}
                </Text>
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 10, color: F.ink3, marginTop: 8 }}>
            Bubble area ∝ count. Low-sample moods (&lt;5) dimmed.
          </Text>
        </View>
      )}

      {data && data.ready && data.deltas.length > 0 && (
        <View style={{ marginTop: 18, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 12, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, padding: 12 }}>
            Biggest mood deltas
          </Text>
          {data.deltas.map((d) => {
            const up = d.deltaAbs > 0;
            return (
              <TouchableOpacity
                key={`d-${d.category_id}-${d.mood}`}
                onPress={() => d.category_id != null && navigation.navigate('PotDetail', {
                  potId: d.category_id,
                  potName: d.name,
                })}
                activeOpacity={d.category_id != null ? 0.7 : 1}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderTopWidth: 1, borderTopColor: F.line }}>
                <Text style={{ fontSize: 22 }}>{d.mood}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>{d.name}</Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    {d.label.toLowerCase()} · {d.n_cell} spends · avg {formatRupees(d.moodAvg, sym)} vs baseline {formatRupees(d.baselineAvg, sym)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: up ? F.coral : F.sageD }}>
                    {up ? '↑' : '↓'} {formatRupees(Math.abs(d.deltaAbs), sym)}
                  </Text>
                  <Text style={{ fontSize: 10, color: F.ink3 }}>
                    {(d.deltaPct * 100).toFixed(0)}%
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Text style={{ fontSize: 10, color: F.ink3, marginTop: 24, textAlign: 'center', lineHeight: 14 }}>
        Mood-tagged expenses only. Tag the mood on each save to enrich this view.
      </Text>
    </ScrollView>
  );
}

export default React.memo(MoodSpend);
