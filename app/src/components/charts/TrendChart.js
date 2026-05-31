// TrendChart — the one reusable renderer for "a single series over an ordered
// axis" (time or category). It draws the series as bars, a line, a filled area
// or lollipops, with a compact type-switcher, tap-to-inspect, an optional
// reference line and a crossfade when the type changes. One component replaces
// the ~10 hand-rolled chart bodies that previously lived inline in each screen.
//
// Two usage modes:
//   • Uncontrolled (default) — the chart reads/writes its own type from the
//     per-chart settings (chartPrefs[chartId]) and renders its own toggle and
//     inspect label. Pass just `chartId` + `series`. Used by most screens.
//   • Controlled — pass `type`/`onTypeChange` and/or `selectedIndex`/
//     `onSelectIndex` to drive the chart from the parent (e.g. Trends keeps its
//     own header + callout). Toggle/inspect-label auto-hide in that case.
//
// react-native-svg is lazy-required; without it the chart degrades to a
// View-based bar fallback so it still renders (and stays tappable) in a dev
// shell that hasn't had a native rebuild.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { useTheme } from '@core/theme/ThemeContext';
import { useSettings } from '@features/profile/settings.context';
import ChartTypeToggle from './ChartTypeToggle';
import { chartDomain, buildPoints, linePath, areaPath, barRects } from './geometry';

let Svg = null, Path = null, Rect = null, Circle = null, Line = null,
  Defs = null, LinearGradient = null, Stop = null, SvgText = null;
try {
  const mod = require('react-native-svg');
  Svg = mod.Svg ?? mod.default;
  Path = mod.Path;
  Rect = mod.Rect;
  Circle = mod.Circle;
  Line = mod.Line;
  Defs = mod.Defs;
  LinearGradient = mod.LinearGradient;
  Stop = mod.Stop;
  SvgText = mod.Text;
} catch (_) { /* dev shell — View-bar fallback below */ }

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export default function TrendChart({
  chartId,
  series,                                   // [{ value, label?, key? }]
  allow = ['bar', 'line', 'area', 'dot'],
  defaultType = 'bar',
  type: typeProp,                           // controlled type (optional)
  onTypeChange,
  selectedIndex: selProp,                   // controlled selection (optional)
  onSelectIndex,
  color,
  highlightColor,
  highlightKey = null,                      // emphasise the datum with this .key
  height = 120,
  zeroBased = true,
  refLine = null,                           // { value, label? }
  formatValue = (v) => String(Math.round(Number(v) || 0)),
  showInspectLabel,
  showXLabels = true,
  showToggle,
  title = null,
  pad: padProp,
}) {
  const { F } = useTheme();
  const settings = useSettings() || {};
  const chartPrefs = settings.chartPrefs || {};
  const lineColor = color || F.coral;
  const hiColor = highlightColor || lineColor;

  const n = series?.length || 0;

  // ---- type (controlled or persisted) -------------------------------------
  const isTypeControlled = typeProp != null;
  const fallbackType = allow.includes(defaultType) ? defaultType : allow[0];
  const persisted = chartPrefs[chartId];
  const [localType, setLocalType] = useState(allow.includes(persisted) ? persisted : fallbackType);
  useEffect(() => {
    if (!isTypeControlled && allow.includes(persisted)) setLocalType(persisted);
  }, [persisted, isTypeControlled]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeType = isTypeControlled
    ? (allow.includes(typeProp) ? typeProp : fallbackType)
    : (allow.includes(localType) ? localType : fallbackType);
  const changeType = (t) => {
    if (isTypeControlled) { onTypeChange?.(t); return; }
    setLocalType(t); // optimistic
    if (chartId && settings.setChartType) settings.setChartType(chartId, t);
  };
  const toggleVisible = (showToggle != null ? showToggle : !isTypeControlled) && allow.length >= 2;

  // ---- selection (controlled or internal) ---------------------------------
  const isSelControlled = selProp !== undefined;
  const [localSel, setLocalSel] = useState(null);
  const cbRef = useRef({});
  cbRef.current = { onSelectIndex, series };
  useEffect(() => {
    if (isSelControlled) return;
    setLocalSel(n === 0 ? null : n - 1); // default-select the latest datum
  }, [n, isSelControlled]);
  const sel = isSelControlled
    ? (selProp == null ? null : clamp(selProp, 0, Math.max(0, n - 1)))
    : localSel;
  const select = (i) => {
    if (!isSelControlled) setLocalSel(i);
    cbRef.current.onSelectIndex?.(i, cbRef.current.series?.[i]);
  };
  const inspectVisible = showInspectLabel != null ? showInspectLabel : !isSelControlled;

  // ---- crossfade on type change -------------------------------------------
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    fade.setValue(0.35);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [activeType, fade]);

  // ---- geometry -----------------------------------------------------------
  const [width, setWidth] = useState(0);
  const refReserve = refLine?.label ? 26 : 8;
  const pad = padProp || {
    top: inspectVisible ? 16 : 8,
    right: 8,
    bottom: showXLabels ? 18 : 8,
    left: refReserve,
  };
  const valuesKey = useMemo(() => (series || []).map((s) => s.value).join('|'), [series]);
  const geo = useMemo(() => {
    if (!width || n === 0) return null;
    const values = series.map((s) => Number(s.value) || 0);
    const domain = chartDomain(values, { zeroBased, refValue: refLine?.value ?? null });
    return buildPoints({ values, width, height, pad, domain });
  }, [width, n, height, zeroBased, refLine?.value, valuesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (n === 0) return null;

  const gradId = `tg-${chartId || 'c'}`;

  // ---- SVG body -----------------------------------------------------------
  function svgBody() {
    if (!geo) return null;
    const { points, baseY, yOf, plot } = geo;
    const out = [];

    // reference line (e.g. inflation base = 1.00, or net = 0)
    if (refLine && Line && Number.isFinite(refLine.value)) {
      const ry = yOf(refLine.value);
      out.push(<Line key="ref" x1={plot.left} y1={ry} x2={plot.left + plot.w} y2={ry}
        stroke={F.ink3} strokeWidth="1" strokeDasharray="3,3" opacity={0.6} />);
      if (refLine.label && SvgText) {
        out.push(<SvgText key="refl" x={plot.left - 4} y={ry + 3} fontSize="9"
          fill={F.ink3} textAnchor="end">{refLine.label}</SvgText>);
      }
    }

    if (activeType === 'bar') {
      for (const b of barRects(geo)) {
        const isSel = b.index === sel;
        const isHi = highlightKey != null && series[b.index]?.key === highlightKey;
        out.push(<Rect key={`b${b.index}`} x={b.x} y={b.y} width={b.w} height={b.h}
          rx={Math.min(4, b.w / 2)}
          fill={isHi && !isSel ? hiColor : lineColor}
          opacity={isSel ? 1 : isHi ? 0.72 : 0.4} />);
      }
    } else if (activeType === 'dot') {
      for (const p of points) {
        out.push(<Line key={`s${p.index}`} x1={p.x} y1={baseY} x2={p.x} y2={p.y}
          stroke={lineColor} strokeWidth="1.5" opacity={p.index === sel ? 1 : 0.4} />);
      }
      for (const p of points) {
        const isSel = p.index === sel;
        out.push(<Circle key={`d${p.index}`} cx={p.x} cy={p.y} r={isSel ? 5 : 3.2}
          fill={isSel ? lineColor : F.surface} stroke={lineColor} strokeWidth={isSel ? 2 : 1.5} />);
      }
    } else {
      // line / area
      if (activeType === 'area' && Defs && LinearGradient) {
        out.push(
          <Defs key="defs">
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity={0.34} />
              <Stop offset="1" stopColor={lineColor} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
        );
        out.push(<Path key="area" d={areaPath(points, baseY)} fill={`url(#${gradId})`} stroke="none" />);
      }
      out.push(<Path key="line" d={linePath(points)} stroke={lineColor} strokeWidth="2"
        fill="none" strokeLinejoin="round" strokeLinecap="round" />);
      for (const p of points) {
        const isSel = p.index === sel;
        out.push(<Circle key={`p${p.index}`} cx={p.x} cy={p.y} r={isSel ? 5 : 2.6}
          fill={isSel ? lineColor : F.surface} stroke={lineColor} strokeWidth={isSel ? 2 : 1.4} />);
      }
    }

    // selection guide for non-bar modes
    if (activeType !== 'bar' && sel != null && points[sel] && Line) {
      out.push(<Line key="guide" x1={points[sel].x} y1={plot.top} x2={points[sel].x}
        y2={plot.top + plot.h} stroke={lineColor} strokeWidth="1" strokeDasharray="2,3" opacity={0.35} />);
    }

    // floating value label above the selected datum
    if (inspectVisible && sel != null && points[sel] && SvgText) {
      const p = points[sel];
      const ly = Math.max(plot.top + 9, Math.min(p.y, baseY) - 6);
      out.push(<SvgText key="lbl" x={clamp(p.x, plot.left + 16, plot.left + plot.w - 16)}
        y={ly} fontSize="10" fontWeight="700" fill={lineColor} textAnchor="middle">
        {formatValue(p.value)}
      </SvgText>);
    }
    return out;
  }

  // ---- View-bar fallback (no react-native-svg) ----------------------------
  function fallbackBars() {
    const max = Math.max(1, ...series.map((s) => Math.abs(Number(s.value) || 0)));
    const h = height - (inspectVisible ? 16 : 8) - (showXLabels ? 18 : 8);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: Math.max(20, h), gap: 4 }}>
        {series.map((s, i) => {
          const isSel = i === sel;
          const bh = (Math.abs(Number(s.value) || 0) / max) * Math.max(20, h);
          return (
            <TouchableOpacity key={s.key || i} onPress={() => select(i)} activeOpacity={0.7}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: Math.max(20, h) }}>
              {isSel && inspectVisible && (
                <Text style={{ fontSize: 9, color: lineColor, fontWeight: '700', marginBottom: 2 }}>
                  {formatValue(s.value)}
                </Text>
              )}
              <View style={{ width: '100%', height: bh, borderRadius: 4,
                backgroundColor: lineColor, opacity: isSel ? 1 : 0.4 }} />
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  const plot = geo?.plot;

  return (
    <View>
      {(toggleVisible || title != null) && (
        <View style={{ flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
          <View style={{ flexShrink: 1 }}>
            {typeof title === 'string'
              ? <Text style={{ fontSize: 13, color: F.ink2, fontWeight: '600' }}>{title}</Text>
              : title}
          </View>
          {toggleVisible
            ? <ChartTypeToggle types={allow} value={activeType} onChange={changeType} F={F} />
            : null}
        </View>
      )}

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ width: '100%', height, position: 'relative' }}>
        {Svg && geo ? (
          <>
            <Animated.View style={{ opacity: fade }}>
              <Svg width={width} height={height}>{svgBody()}</Svg>
            </Animated.View>
            {/* uniform tap overlay — one cell per datum across the plot rect */}
            <View style={{ position: 'absolute', left: plot.left, top: plot.top,
              width: plot.w, height: plot.h, flexDirection: 'row' }}>
              {series.map((s, i) => (
                <TouchableOpacity key={s.key || i} activeOpacity={0.5}
                  onPress={() => select(i)} style={{ flex: 1 }} />
              ))}
            </View>
          </>
        ) : (
          fallbackBars()
        )}
      </View>

      {showXLabels && (
        <View style={{ flexDirection: 'row', marginTop: 4,
          paddingLeft: plot ? plot.left : 8, paddingRight: plot ? plot.right : 8 }}>
          {series.map((s, i) => {
            const dense = n > 12;
            const show = !dense || i === 0 || i === n - 1 || i % Math.ceil(n / 6) === 0;
            const isSel = i === sel;
            return (
              <Text key={s.key || i} numberOfLines={1}
                style={{ flex: 1, fontSize: 9, textAlign: 'center',
                  color: isSel ? lineColor : F.ink3, fontWeight: isSel ? '700' : '400' }}>
                {show ? (s.label || '') : ''}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}
