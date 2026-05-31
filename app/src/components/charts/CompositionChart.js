// CompositionChart — "parts of a whole" rendered as a donut or a stacked
// horizontal proportion bar, with a compact toggle. Used by composition
// surfaces (e.g. income-by-source). The legend stays with the host screen; this
// component only owns the donut/bar visual + its persisted type.
//
// Self-manages its type from chartPrefs[chartId] (uncontrolled). Falls back to
// the proportion bar when react-native-svg is unavailable.

import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '@core/theme/ThemeContext';
import { useSettings } from '@features/profile/settings.context';
import ChartTypeToggle from './ChartTypeToggle';

let Svg = null, Circle = null;
try {
  const mod = require('react-native-svg');
  Svg = mod.Svg ?? mod.default;
  Circle = mod.Circle;
} catch (_) { /* proportion-bar fallback below */ }

function Donut({ segments, total, F, size, stroke, centerLabel, centerValue }) {
  const R = (size - stroke) / 2;
  const C = 2 * Math.PI * R;
  const CENTER = size / 2;
  let cum = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={CENTER} cy={CENTER} r={R} stroke={F.line} strokeWidth={stroke} fill="none" />
        {segments.map((s, i) => {
          const frac = total > 0 ? (Number(s.value) || 0) / total : 0;
          const seg = frac * C;
          const dashoffset = -cum * C;
          cum += frac;
          return (
            <Circle key={s.key || s.label || i} cx={CENTER} cy={CENTER} r={R}
              stroke={s.color} strokeWidth={stroke} fill="none"
              strokeDasharray={`${seg} ${C - seg}`} strokeDashoffset={dashoffset}
              transform={`rotate(-90 ${CENTER} ${CENTER})`} />
          );
        })}
      </Svg>
      {(centerLabel != null || centerValue != null) && (
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          {centerLabel != null && <Text style={{ fontSize: 11, color: F.ink3 }}>{centerLabel}</Text>}
          {centerValue != null && (
            <Text style={{ fontSize: 20, color: F.ink, fontWeight: '700' }}>{centerValue}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function ProportionBar({ segments, total, F }) {
  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', height: 26, borderRadius: 13, overflow: 'hidden', backgroundColor: F.line }}>
        {segments.map((s, i) => (
          <View key={s.key || s.label || i}
            style={{ flex: Math.max((total > 0 ? (Number(s.value) || 0) / total : 0), 0.0001),
              backgroundColor: s.color }} />
        ))}
      </View>
    </View>
  );
}

export default function CompositionChart({
  chartId,
  segments = [],
  allow = ['donut', 'bar'],
  defaultType = 'donut',
  size = 168,
  stroke = 24,
  centerLabel = null,
  centerValue = null,
  showToggle = true,
}) {
  const { F } = useTheme();
  const settings = useSettings() || {};
  const chartPrefs = settings.chartPrefs || {};

  const fallbackType = allow.includes(defaultType) ? defaultType : allow[0];
  const persisted = chartPrefs[chartId];
  const [localType, setLocalType] = useState(allow.includes(persisted) ? persisted : fallbackType);
  useEffect(() => {
    if (allow.includes(persisted)) setLocalType(persisted);
  }, [persisted]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeType = allow.includes(localType) ? localType : fallbackType;
  const changeType = (t) => {
    setLocalType(t);
    if (chartId && settings.setChartType) settings.setChartType(chartId, t);
  };

  const total = segments.reduce((a, s) => a + (Number(s.value) || 0), 0);
  const canDonut = !!(Svg && Circle);
  const showDonut = activeType === 'donut' && canDonut;

  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      {showToggle && allow.length >= 2 && (
        <View style={{ alignSelf: 'flex-end', marginBottom: 10 }}>
          <ChartTypeToggle
            types={canDonut ? allow : allow.filter((t) => t !== 'donut')}
            value={canDonut ? activeType : 'bar'}
            onChange={changeType}
            F={F}
          />
        </View>
      )}
      {showDonut ? (
        <Donut segments={segments} total={total} F={F} size={size} stroke={stroke}
          centerLabel={centerLabel} centerValue={centerValue} />
      ) : (
        <ProportionBar segments={segments} total={total} F={F} />
      )}
    </View>
  );
}
