// 7.13 + PS-04 — Net Worth screen.
//
// Renders:
//   1. Hero strip (net + assets + liabilities).
//   2. Assets-vs-liabilities donut (PS-04).
//   3. 12-month projection strip — trailing-3mo savings × 12 + current net,
//      sign-coloured. Empty-state when no income recorded.
//   4. NetWorthChart trajectory (7.13).
//   5. Per-account balance bars sorted desc by |balance| (PS-04).
//   6. Existing Asset / Liability section blocks.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useInvestments } from '@features/investments/context';
import { snapshotsRepo } from '../snapshot';
import NetWorthChart from '@components/NetWorthChart';
import { assetClassBreakdown, multiArcDonut } from '../assetClass';

let Svg = null, Path = null, Circle = null, Line = null, SvgText = null;
try {
  const mod = require('react-native-svg');
  Svg     = mod.Svg     ?? mod.default;
  Path    = mod.Path;
  Circle  = mod.Circle;
  Line    = mod.Line;
  SvgText = mod.Text;
} catch (_) { /* dev shell — falls back to numeric strips */ }

// Pure geometry helpers — exported for /tmp/ validation.

// Two-arc donut for assets vs liabilities. Returns SVG path strings + the
// midpoints needed for label positioning. Both arcs go clockwise starting at
// 12-o'clock so assets occupy the left half visually (asset > 0 side first).
export function donutArc(assets, liabilities, cx, cy, rOuter, rInner) {
  const total = assets + liabilities;
  if (!Number.isFinite(total) || total <= 0) return null;
  const aFrac = assets / total;
  const lFrac = liabilities / total;
  const ringPath = (startFrac, sweepFrac) => {
    if (sweepFrac <= 0) return '';
    // start at 12 o'clock, sweep clockwise
    const a0 = -Math.PI / 2 + startFrac  * 2 * Math.PI;
    const a1 = -Math.PI / 2 + (startFrac + sweepFrac) * 2 * Math.PI;
    const sx = cx + rOuter * Math.cos(a0);
    const sy = cy + rOuter * Math.sin(a0);
    const ex = cx + rOuter * Math.cos(a1);
    const ey = cy + rOuter * Math.sin(a1);
    const sxI = cx + rInner * Math.cos(a1);
    const syI = cy + rInner * Math.sin(a1);
    const exI = cx + rInner * Math.cos(a0);
    const eyI = cy + rInner * Math.sin(a0);
    const large = sweepFrac > 0.5 ? 1 : 0;
    // Path: M start_outer → arc to end_outer → line to end_inner → arc back to start_inner → close
    return `M ${sx.toFixed(2)} ${sy.toFixed(2)} ` +
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} ` +
      `L ${sxI.toFixed(2)} ${syI.toFixed(2)} ` +
      `A ${rInner} ${rInner} 0 ${large} 0 ${exI.toFixed(2)} ${eyI.toFixed(2)} ` +
      `Z`;
  };
  return {
    assetsPath:      ringPath(0,       aFrac),
    liabilitiesPath: ringPath(aFrac,   lFrac),
    aFrac, lFrac,
  };
}

// Projection line geometry. Given current_net and trailing monthly_savings,
// returns start + end coords for a line over `months` months drawn into a
// chart of `width × height`. yMin/yMax computed across both endpoints so a
// negative slope still fits inside the box.
export function projectionLayout(currentNet, monthlySavings, months, width, height, opts = {}) {
  const pad = opts.padding ?? { left: 14, right: 14, top: 14, bottom: 22 };
  const usableW = width - pad.left - pad.right;
  const usableH = height - pad.top - pad.bottom;
  const endNet = currentNet + monthlySavings * months;
  const yLo = Math.min(currentNet, endNet);
  const yHi = Math.max(currentNet, endNet);
  const span = yHi - yLo || Math.abs(currentNet) || 1;
  // Pad the y range by 10% so endpoints aren't flush against the box edges.
  const yPad = span * 0.1;
  const yMin = yLo - yPad;
  const yMax = yHi + yPad;
  const yScale = (v) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * usableH;
  return {
    x0: pad.left,                  y0: yScale(currentNet),
    x1: pad.left + usableW,        y1: yScale(endNet),
    width, height, padding: pad,
    currentNet, endNet, monthlySavings, months,
    direction: endNet > currentNet ? 'up' : endNet < currentNet ? 'down' : 'flat',
  };
}

function fmtMoney(sym, n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1_00_000) return `${v < 0 ? '−' : ''}${sym}${(abs / 1_00_000).toFixed(1)}L`;
  return `${v < 0 ? '−' : ''}${sym}${abs.toLocaleString('en-IN')}`;
}

function NetWorth({ navigation }) {
  const { F, sym, accounts } = useApp();
  const { totals: holdingsTotals, holdings } = useInvestments();
  const insets = useSafeAreaInsets();
  const [savings, setSavings] = useState(null);
  // PS-32 — donut mode toggle + tapped class for the drill-down.
  const [donutMode, setDonutMode] = useState('al'); // 'al' | 'class'
  const [selectedClass, setSelectedClass] = useState(null);

  useEffect(() => {
    let cancelled = false;
    snapshotsRepo.trailingSavingsRate({ months: 3 })
      .then((r) => { if (!cancelled) setSavings(r); })
      .catch(() => { if (!cancelled) setSavings(null); });
    return () => { cancelled = true; };
  }, [accounts]);

  const live = accounts.filter((a) => !a.deleted_at);
  const assets = live.filter((a) => a.kind === 'asset');
  const liabs  = live.filter((a) => a.kind === 'liability');
  const accountAssets = assets.reduce((s, a) => s + a.balance, 0);
  const holdingsValue = Number(holdingsTotals?.marketValue) || 0;
  const at = accountAssets + holdingsValue;
  const lt = liabs.reduce((s, l) => s + l.balance, 0);
  const net = at - lt;

  // Per-account bars: combined list sorted desc by |balance|.
  const barAccounts = useMemo(() => {
    const rows = live
      .filter((a) => Math.abs(a.balance) > 0)
      .map((a) => ({ ...a, abs: Math.abs(a.balance) }))
      .sort((a, b) => b.abs - a.abs);
    const max = rows[0]?.abs || 1;
    return rows.map((r) => ({ ...r, frac: r.abs / max }));
  }, [live]);

  // Donut geometry.
  const donutSize = 168;
  const donutR = donutSize / 2;
  const donut = useMemo(
    () => donutArc(at, lt, donutR, donutR, donutR - 6, donutR - 22),
    [at, lt, donutR],
  );

  // PS-32 — asset-class breakdown + multi-arc geometry for the class donut.
  const classBreakdown = useMemo(
    () => assetClassBreakdown(assets, holdings || []),
    [assets, holdings],
  );
  const classArcs = useMemo(
    () => multiArcDonut(
      classBreakdown.map((b) => ({ value: b.value, color: b.color, key: b.key })),
      donutR, donutR, donutR - 6, donutR - 22,
    ),
    [classBreakdown, donutR],
  );
  const selectedBucket = selectedClass
    ? classBreakdown.find((b) => b.key === selectedClass)
    : null;

  // Projection geometry.
  const winW = Dimensions.get('window').width;
  const projW = Math.max(280, winW - 40);
  const projH = 120;
  const projection = useMemo(() => {
    if (!savings || !savings.ready) return null;
    return projectionLayout(net, savings.savingsAvg, 12, projW, projH);
  }, [savings, net, projW, projH]);

  const Section = ({ title, total, items, kind, sign, totalColor }) => (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontSize: 18, color: F.ink }}>{title}</Text>
        <Text style={{ fontSize: 16, color: totalColor }}>{sign}{sym}{total.toLocaleString()}</Text>
      </View>
      {items.length === 0 ? (
        <TouchableOpacity
          onPress={() => navigation.navigate('EditAccount', { kind })}
          activeOpacity={0.8}
          style={{ borderWidth: 2, borderColor: F.line, borderStyle: 'dashed',
            borderRadius: 20, padding: 18, marginBottom: 20, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, color: F.ink2 }}>+ Add {title.toLowerCase()}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1,
          borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
          {items.map((a, i) => (
            <TouchableOpacity
              key={a.id}
              onPress={() => navigation.navigate('EditAccount', { id: a.id })}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                backgroundColor: kind === 'asset' ? F.mint : F.blush,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16 }}>{a.emoji || '💼'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>{a.label}</Text>
                {a.category && <Text style={{ fontSize: 11, color: F.ink3 }}>{a.category}</Text>}
              </View>
              <Text style={{ fontSize: 15, color: kind === 'asset' ? F.ink : F.coral, fontWeight: '500' }}>
                {sign}{sym}{a.balance.toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => navigation.navigate('EditAccount', { kind })}
            activeOpacity={0.7}
            style={{ padding: 14, borderTopWidth: 1, borderTopColor: F.line, alignItems: 'center' }}
          >
            <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>+ Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
      <View style={{ backgroundColor: F.cream, borderRadius: 26, padding: 24,
        marginTop: 16, marginBottom: 20 }}>
        <Text style={{ fontSize: 13, color: F.ink2 }}>Net worth</Text>
        <Text style={{ fontSize: 48, color: net >= 0 ? F.ink : F.coral,
          fontWeight: '400', marginTop: 4 }}>
          {net < 0 ? '−' : ''}{sym}{Math.abs(net).toLocaleString()}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <Text style={{ fontSize: 12, color: F.sageD }}>+ {sym}{at.toLocaleString()} assets</Text>
          <Text style={{ fontSize: 12, color: F.coral }}>− {sym}{lt.toLocaleString()} owed</Text>
        </View>
      </View>

      {/* PS-04 / PS-32 — net-worth donut with an Assets-vs-Liabilities ↔ By-asset-class toggle */}
      {Svg && (donut || classBreakdown.length > 0) && (
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignSelf: 'center', backgroundColor: F.surface,
            borderRadius: 99, borderWidth: 1, borderColor: F.line, padding: 3, marginBottom: 12 }}>
            {[{ k: 'al', l: 'Assets vs Liabilities' }, { k: 'class', l: 'By asset class' }].map((opt) => {
              const sel = donutMode === opt.k;
              return (
                <TouchableOpacity key={opt.k}
                  onPress={() => { setDonutMode(opt.k); setSelectedClass(null); }}
                  accessibilityRole="button" accessibilityState={{ selected: sel }}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99,
                    backgroundColor: sel ? F.coral : 'transparent' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: sel ? '#fff' : F.ink2 }}>{opt.l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {donutMode === 'al' ? (
            donut ? (
              <View style={{ alignItems: 'center' }}>
                <Svg width={donutSize} height={donutSize}>
                  <Path d={donut.assetsPath}      fill={F.sageD}/>
                  <Path d={donut.liabilitiesPath} fill={F.coral}/>
                  <SvgText x={donutR} y={donutR - 6} fontSize="11" fill={F.ink3} textAnchor="middle">Net</SvgText>
                  <SvgText x={donutR} y={donutR + 14} fontSize="18" fill={net >= 0 ? F.ink : F.coral}
                    fontWeight="700" textAnchor="middle">
                    {fmtMoney(sym, net)}
                  </SvgText>
                </Svg>
                <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: F.sageD }}/>
                    <Text style={{ fontSize: 11, color: F.ink2 }}>Assets {Math.round(donut.aFrac * 100)}%</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: F.coral }}/>
                    <Text style={{ fontSize: 11, color: F.ink2 }}>Liabilities {Math.round(donut.lFrac * 100)}%</Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: F.ink3, textAlign: 'center' }}>Add accounts to see the split.</Text>
            )
          ) : (
            classBreakdown.length > 0 ? (
              <View style={{ alignItems: 'center' }}>
                <Svg width={donutSize} height={donutSize}>
                  {classArcs.map((a) => (
                    <Path key={a.key} d={a.path} fill={a.color}
                      opacity={selectedClass && selectedClass !== a.key ? 0.3 : 1}/>
                  ))}
                  <SvgText x={donutR} y={donutR - 6} fontSize="11" fill={F.ink3} textAnchor="middle">Assets</SvgText>
                  <SvgText x={donutR} y={donutR + 14} fontSize="16" fill={F.ink} fontWeight="700" textAnchor="middle">
                    {fmtMoney(sym, at)}
                  </SvgText>
                </Svg>
                {/* tappable legend → per-class drill list */}
                <View style={{ width: '100%', marginTop: 10 }}>
                  {classBreakdown.map((b) => {
                    const sel = selectedClass === b.key;
                    const pct = at > 0 ? Math.round((b.value / at) * 100) : 0;
                    return (
                      <View key={b.key}>
                        <TouchableOpacity onPress={() => setSelectedClass(sel ? null : b.key)}
                          accessibilityRole="button" accessibilityState={{ expanded: sel }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: b.color }}/>
                          <Text style={{ flex: 1, fontSize: 13, color: F.ink, fontWeight: sel ? '700' : '500' }}>{b.label}</Text>
                          <Text style={{ fontSize: 12, color: F.ink2 }}>{fmtMoney(sym, b.value)}</Text>
                          <Text style={{ fontSize: 11, color: F.ink3, width: 34, textAlign: 'right' }}>{pct}%</Text>
                          <Text style={{ fontSize: 12, color: F.ink3 }}>{sel ? '▾' : '▸'}</Text>
                        </TouchableOpacity>
                        {sel && b.members.map((m, i) => (
                          <View key={`${b.key}-${i}`} style={{ flexDirection: 'row', alignItems: 'center',
                            gap: 8, paddingVertical: 5, paddingLeft: 18 }}>
                            <Text style={{ fontSize: 12 }}>{m.type === 'holding' ? '📈' : '💼'}</Text>
                            <Text style={{ flex: 1, fontSize: 12, color: F.ink2 }} numberOfLines={1}>{m.label}</Text>
                            <Text style={{ fontSize: 12, color: F.ink2 }}>{fmtMoney(sym, m.value)}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: F.ink3, textAlign: 'center' }}>
                Give your asset accounts a category (e.g. “Bank”, “Gold”) to see the class split.
              </Text>
            )
          )}
        </View>
      )}

      {/* PS-04 — 12-month projection */}
      {savings && (
        <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1, borderColor: F.line, padding: 14, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 13, color: F.ink2 }}>Projected in 12 months</Text>
            {savings.ready && (
              <Text style={{ fontSize: 11, color: F.ink3 }}>
                trailing {savings.windowMonths}mo
              </Text>
            )}
          </View>
          {!savings.ready ? (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 13, color: F.ink3 }}>
                Add income to project. Need at least {savings.windowMonths} months of recorded income.
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 24, color: projection?.direction === 'down' ? F.coral : F.ink, fontWeight: '700', marginTop: 4 }}>
                {projection?.direction === 'up' ? '↑ ' : projection?.direction === 'down' ? '↓ ' : ''}
                {fmtMoney(sym, projection?.endNet || 0)}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                At {Math.round((savings.savingsRate || 0) * 100)}% trailing savings · {fmtMoney(sym, savings.savingsAvg)}/mo
              </Text>
              {Svg && projection ? (
                <Svg width={projW} height={projH} style={{ marginTop: 10 }}>
                  <Line
                    x1={projection.padding.left} y1={projH - projection.padding.bottom}
                    x2={projW - projection.padding.right} y2={projH - projection.padding.bottom}
                    stroke={F.line} strokeWidth={1}/>
                  <Line
                    x1={projection.x0} y1={projection.y0}
                    x2={projection.x1} y2={projection.y1}
                    stroke={projection.direction === 'down' ? F.coral : F.sageD}
                    strokeWidth={2.5}/>
                  <Circle cx={projection.x0} cy={projection.y0} r={4}
                    fill={projection.direction === 'down' ? F.coral : F.sageD}/>
                  <Circle cx={projection.x1} cy={projection.y1} r={5}
                    fill={projection.direction === 'down' ? F.coral : F.sageD}/>
                </Svg>
              ) : null}
            </>
          )}
        </View>
      )}

      {/* PS-10 — Investments card. Always shown; tap to manage holdings. */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Holdings')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Open investments"
        style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1,
          borderColor: F.line, padding: 14, marginBottom: 20,
          flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 13,
          backgroundColor: F.cream, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20 }}>📈</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
            Investments
          </Text>
          <Text style={{ fontSize: 11, color: F.ink3 }}>
            {holdingsTotals?.count
              ? `${holdingsTotals.count} holding${holdingsTotals.count === 1 ? '' : 's'} · included in assets above`
              : 'Track MF / equity / gold / FD / NPS / PPF'}
          </Text>
        </View>
        <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>
          {sym}{Math.round(holdingsValue).toLocaleString('en-IN')}
        </Text>
      </TouchableOpacity>

      {/* 7.13 — Trajectory chart renders only once at least a week of
          snapshots is in the table. AccountsProvider re-stamps today's
          snapshot on every mutation. */}
      <NetWorthChart/>

      {/* PS-04 — per-account balance bars (combined list, sorted desc by |balance|) */}
      {barAccounts.length > 0 && (
        <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1, borderColor: F.line, padding: 14, marginBottom: 20 }}>
          <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 10 }}>Account balances</Text>
          {barAccounts.map((a) => {
            const isAsset = a.kind === 'asset';
            const barColor = isAsset ? F.sageD : F.coral;
            return (
              <TouchableOpacity
                key={`bar-${a.id}`}
                onPress={() => navigation.navigate('EditAccount', { id: a.id })}
                activeOpacity={0.7}
                style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: F.ink, fontWeight: '500' }} numberOfLines={1}>
                    {a.emoji || (isAsset ? '💰' : '💳')} {a.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: isAsset ? F.ink : F.coral, fontWeight: '600' }}>
                    {isAsset ? '' : '−'}{sym}{a.balance.toLocaleString()}
                  </Text>
                </View>
                <View style={{ height: 6, backgroundColor: F.line, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{
                    height: 6, width: `${Math.max(4, a.frac * 100)}%`,
                    backgroundColor: barColor, borderRadius: 3,
                  }}/>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Section title="Assets"      total={at} items={assets} kind="asset"
        sign=""  totalColor={F.sageD}/>
      <Section title="Liabilities" total={lt} items={liabs}  kind="liability"
        sign="−" totalColor={F.coral}/>
    </ScrollView>
  );
}

export default React.memo(NetWorth);
