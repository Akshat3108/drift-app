// 7.13 — NetWorth trajectory chart.
//
// Renders `net` over time with range pills (30d / 90d / 1y / All) and a
// tap-to-pin callout. The series itself is drawn by the shared TrendChart
// (line / area / bar / dot, switchable via its toggle); this component owns the
// data loading, the range pills, the pinned-day callout and the net=0 baseline.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@core/theme/ThemeContext';
import { useAccounts } from '@features/accounts/context';
import { useSettings } from '@features/profile/settings.context';
import TrendChart from '@components/charts/TrendChart';

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

  // Chart series + whether to draw the net=0 baseline (only when the data
  // actually straddles zero, matching the old behaviour).
  const { chartSeries, showZero } = useMemo(() => {
    const nets = series.map(r => Number(r.net) || 0);
    return {
      chartSeries: series.map(r => ({ value: Number(r.net) || 0, key: r.snapshot_date })),
      showZero: nets.length > 0 && Math.min(...nets) < 0 && Math.max(...nets) > 0,
    };
  }, [series]);

  // Hide the chart until we have at least a week of snapshots — a 2-point line
  // looks worse than nothing.
  if (count < 7) return null;

  const pinned = pinIdx != null && series[pinIdx] ? series[pinIdx] : null;

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

      {series.length >= 2 ? (
        <View>
          <TrendChart
            chartId="networth.trajectory"
            series={chartSeries}
            allow={['line', 'area', 'bar', 'dot']}
            defaultType="line"
            height={180}
            zeroBased={false}
            color={F.coral}
            refLine={showZero ? { value: 0 } : null}
            selectedIndex={pinIdx}
            onSelectIndex={(i) => setPinIdx(i)}
            showInspectLabel={false}
            showXLabels={false}
            formatValue={(v) => `${v < 0 ? '−' : ''}${fmt(sym, Math.abs(v))}`}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between',
            paddingHorizontal: 4, marginTop: 2 }}>
            <Text style={{ fontSize: 10, color: F.ink3 }}>{series[0]?.snapshot_date || ''}</Text>
            <Text style={{ fontSize: 10, color: F.ink3 }}>{series[series.length - 1]?.snapshot_date || ''}</Text>
          </View>
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: F.ink3, padding: 12 }}>
          Need at least 2 snapshots to draw a line.
        </Text>
      )}

      <View style={{ marginTop: 8, padding: 10, backgroundColor: F.cream,
        borderRadius: 12, borderWidth: 1, borderColor: F.line }}>
        {pinned ? (
          <>
            <Text style={{ fontSize: 12, color: F.ink2 }}>{pinned.snapshot_date}</Text>
            <Text style={{ fontSize: 16, color: (Number(pinned.net) || 0) >= 0 ? F.ink : F.coral, fontWeight: '600' }}>
              Net {(Number(pinned.net) || 0) < 0 ? '−' : ''}{fmt(sym, Math.abs(Number(pinned.net) || 0))}
            </Text>
            <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
              {fmt(sym, pinned.total_assets)} assets · {fmt(sym, pinned.total_liabilities)} owed
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
