// 7.13 — NetWorth trajectory chart.
//
// Renders an SVG line of `net` over time with range pills (30d / 90d / 1y / All)
// and tap-to-pin callout. Falls back silently to a numeric summary when
// react-native-svg fails to load (dev shells).

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { useTheme } from '@core/theme/ThemeContext';
import { useAccounts } from '@features/accounts/context';
import { useSettings } from '@features/profile/settings.context';

let Svg = null, Polyline = null, Line = null, Circle = null;
try {
  const mod = require('react-native-svg');
  Svg      = mod.Svg ?? mod.default;
  Polyline = mod.Polyline;
  Line     = mod.Line;
  Circle   = mod.Circle;
} catch (_) { /* dev shell — falls back to a numeric strip */ }

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 40;
const CHART_H  = 180;
const PAD      = { top: 14, right: 14, bottom: 26, left: 14 };

const RANGES = [
  { key: '30',  label: '30d',  days: 30,    all: false },
  { key: '90',  label: '90d',  days: 90,    all: false },
  { key: '365', label: '1y',   days: 365,   all: false },
  { key: 'all', label: 'All',  days: null,  all: true  },
];

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

// Build geometry: x positions evenly spaced; y mapped against [min*0.95, max*1.05]
// so a negative net still renders. Returns null when fewer than 2 points exist
// (callers should hide the chart in that state).
function chartGeometry(series) {
  if (!series || series.length < 2) return null;
  const usableW = CHART_W - PAD.left - PAD.right;
  const usableH = CHART_H - PAD.top - PAD.bottom;
  const nets = series.map(r => Number(r.net) || 0);
  let lo = Math.min(...nets);
  let hi = Math.max(...nets);
  if (lo === hi) {
    // Flat line — give it some padding so a non-zero value isn't pinned to bottom.
    const span = Math.abs(lo) > 0 ? Math.abs(lo) * 0.1 : 1;
    lo -= span;
    hi += span;
  } else {
    const span = hi - lo;
    lo -= span * 0.05;
    hi += span * 0.05;
  }
  const stepX = usableW / (series.length - 1);
  const pts = series.map((r, i) => ({
    x: PAD.left + i * stepX,
    y: PAD.top + (1 - ((Number(r.net) - lo) / (hi - lo))) * usableH,
    date: r.snapshot_date,
    net: Number(r.net) || 0,
    assets: Number(r.total_assets) || 0,
    liab:   Number(r.total_liabilities) || 0,
  }));
  return { pts, lo, hi };
}

export default function NetWorthChart() {
  const { F } = useTheme();
  const { sym } = useSettings();
  const { trajectory, snapshotCount, accounts } = useAccounts();
  const [range, setRange] = useState('90');
  const [series, setSeries] = useState([]);
  const [count, setCount] = useState(0);
  const [pinIdx, setPinIdx] = useState(null);

  const refreshGen = accounts.length; // re-load chart whenever accounts changes

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cur = RANGES.find(r => r.key === range) || RANGES[1];
      const [rows, n] = await Promise.all([
        trajectory(cur.all ? { all: true } : { days: cur.days }),
        snapshotCount(),
      ]);
      if (!cancelled) {
        setSeries(rows || []);
        setCount(n || 0);
        setPinIdx(null);
      }
    })();
    return () => { cancelled = true; };
  }, [range, refreshGen, trajectory, snapshotCount]);

  const geo = useMemo(() => chartGeometry(series), [series]);

  // Hide the chart until we have at least a week of snapshots — a 2-point line
  // looks worse than nothing.
  if (count < 7) return null;

  const pinned = pinIdx != null && geo ? geo.pts[pinIdx] : null;

  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 12,
      borderWidth: 1, borderColor: F.line, marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
        <Text style={{ fontSize: 13, color: F.ink2, flex: 1, fontWeight: '600' }}>Trajectory</Text>
        {RANGES.map((r) => {
          const sel = r.key === range;
          return (
            <TouchableOpacity key={r.key}
              onPress={() => setRange(r.key)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                backgroundColor: sel ? F.coral : F.cream,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
              }}>
              <Text style={{ fontSize: 11, color: sel ? '#fff' : F.ink, fontWeight: '600' }}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {geo && Svg && Polyline ? (
        <View>
          <Svg width={CHART_W} height={CHART_H}>
            {/* baseline at net=0 if visible inside [lo, hi] */}
            {geo.lo < 0 && geo.hi > 0 && (() => {
              const zeroY = PAD.top + (1 - ((0 - geo.lo) / (geo.hi - geo.lo))) * (CHART_H - PAD.top - PAD.bottom);
              return (
                <Line x1={PAD.left} x2={CHART_W - PAD.right} y1={zeroY} y2={zeroY}
                  stroke={F.line} strokeWidth="1" strokeDasharray="3 3"/>
              );
            })()}
            <Polyline
              points={geo.pts.map(p => `${p.x},${p.y}`).join(' ')}
              stroke={F.coral} strokeWidth="2" fill="none"/>
            {pinned && (
              <Circle cx={pinned.x} cy={pinned.y} r={5} fill={F.coral}/>
            )}
            {/* Hit-zones: invisible circles so taps land cleanly */}
            {geo.pts.map((p, i) => (
              <Circle key={`hit-${i}`} cx={p.x} cy={p.y} r={12} fill="#0000"
                onPress={() => setPinIdx(i)}/>
            ))}
          </Svg>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between',
            paddingHorizontal: 4, marginTop: 2 }}>
            <Text style={{ fontSize: 10, color: F.ink3 }}>{series[0]?.snapshot_date || ''}</Text>
            <Text style={{ fontSize: 10, color: F.ink3 }}>{series[series.length - 1]?.snapshot_date || ''}</Text>
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: F.ink3, padding: 12 }}>
          {!Svg ? '(install react-native-svg for chart)' : 'Need at least 2 snapshots to draw a line.'}
        </Text>
      )}

      <View style={{ marginTop: 8, padding: 10, backgroundColor: F.cream,
        borderRadius: 12, borderWidth: 1, borderColor: F.line }}>
        {pinned ? (
          <>
            <Text style={{ fontSize: 12, color: F.ink2 }}>{pinned.date}</Text>
            <Text style={{ fontSize: 16, color: pinned.net >= 0 ? F.ink : F.coral, fontWeight: '600' }}>
              Net {pinned.net < 0 ? '−' : ''}{fmt(sym, Math.abs(pinned.net))}
            </Text>
            <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
              {fmt(sym, pinned.assets)} assets · {fmt(sym, pinned.liab)} owed
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 12, color: F.ink3 }}>
            Tap a point on the line to see that day's balances. {count} snapshot{count === 1 ? '' : 's'} logged.
          </Text>
        )}
      </View>
    </View>
  );
}
