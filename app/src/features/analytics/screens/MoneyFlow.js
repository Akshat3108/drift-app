// PS-01 — Money flow (Income → Categories Sankey)
//
// Reads `moneyFlow({ month })` from analytics. Renders the active month's
// income (or budget when income is zero) as a left node and each category
// with positive spend as a right node, joined by cubic-Bezier flow strokes
// whose width is proportional to the category's share of total spend.
//
// Long-tail categories beyond the top 8 are aggregated into an 'Other'
// flow by the engine; tapping 'Other' opens a bottom sheet listing the
// collapsed categories. Tapping a normal flow navigates to PotDetail.
//
// SVG layout is split out into the pure `sankeyLayout()` helper so it can
// be exercised by a /tmp/ validator without RN.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { moneyFlow } from '../../../analytics';
import { palette, potBg } from '../../../theme';

let Svg = null, Path = null, Rect = null, SvgText = null;
try {
  const mod = require('react-native-svg');
  Svg     = mod.Svg     ?? mod.default;
  Path    = mod.Path;
  Rect    = mod.Rect;
  SvgText = mod.Text;
} catch (_) { /* dev shell — falls back to a numeric list */ }

const TOP_PAD = 16;
const BOT_PAD = 16;
const LEFT_BAR_W = 22;
const RIGHT_BAR_W = 22;
const NODE_GAP = 6;
const MIN_LINK_W = 2;
const MAX_LINK_W = 64;

// Pure layout. Returns { width, height, left, right[], links[] } given
// `flows: [{ category_id, name, value, share, color, emoji }]` already
// sorted desc by value. Color resolution is done by the caller before the
// layout call so this helper stays presentation-pure.
export function sankeyLayout(flows, width, height, opts = {}) {
  const padTop = opts.padTop ?? TOP_PAD;
  const padBot = opts.padBot ?? BOT_PAD;
  const leftBarW = opts.leftBarW ?? LEFT_BAR_W;
  const rightBarW = opts.rightBarW ?? RIGHT_BAR_W;
  const nodeGap = opts.nodeGap ?? NODE_GAP;
  const usableH = height - padTop - padBot;

  const n = flows.length;
  const totalShare = flows.reduce((s, f) => s + (f.share || 0), 0) || 1;
  const gapTotal = nodeGap * Math.max(0, n - 1);
  const nodeHeightTotal = Math.max(0, usableH - gapTotal);

  // Left node spans the full usable height (anchor for all links).
  const left = {
    x: 0,
    y: padTop,
    h: usableH,
    w: leftBarW,
  };

  // Right nodes: vertical stack with heights proportional to share.
  let cursorY = padTop;
  const right = flows.map((f) => {
    const h = Math.max(2, (f.share / totalShare) * nodeHeightTotal);
    const node = {
      id: f.category_id,
      name: f.name,
      emoji: f.emoji,
      color: f.color,
      x: width - rightBarW,
      y: cursorY,
      h,
      w: rightBarW,
    };
    cursorY += h + nodeGap;
    return node;
  });

  // Each link anchors at left.y + share-weighted offset on the left bar
  // and at the centre of its right node on the right bar.
  let leftCursor = left.y;
  const links = flows.map((f, i) => {
    const sliceH = (f.share / totalShare) * usableH; // exact, no gap on left
    const leftMidY = leftCursor + sliceH / 2;
    leftCursor += sliceH;
    const r = right[i];
    const rightMidY = r.y + r.h / 2;
    const x0 = left.x + left.w;
    const x1 = r.x;
    const cx = (x0 + x1) / 2;
    const d = `M ${x0.toFixed(1)} ${leftMidY.toFixed(1)} C ${cx.toFixed(1)} ${leftMidY.toFixed(1)} ${cx.toFixed(1)} ${rightMidY.toFixed(1)} ${x1.toFixed(1)} ${rightMidY.toFixed(1)}`;
    const strokeW = Math.max(MIN_LINK_W, Math.min(MAX_LINK_W, sliceH));
    return {
      d,
      strokeW,
      color: r.color,
      fromId: 'left',
      toId: r.id,
      toName: r.name,
      toIndex: i,
    };
  });

  return { width, height, left, right, links };
}

function formatRupees(n, sym) {
  if (n == null) return `${sym}0`;
  const abs = Math.round(Math.abs(n));
  if (abs >= 1_00_000) return `${sym}${(n / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}k`;
  return `${sym}${abs}`;
}

function formatMonth(m) {
  const [yr, mo] = m.split('-').map(Number);
  return new Date(yr, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function MoneyFlow({ navigation, route }) {
  const { F, sym, activeMonth } = useApp();
  const insets = useSafeAreaInsets();

  // PS-05 — context-wide activeMonth wins. `route.params.month` retained as
  // an explicit override for deep-link / future per-screen use.
  const month = route?.params?.month || activeMonth || new Date().toISOString().slice(0, 7);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);

  const load = useCallback(async () => {
    const d = await moneyFlow({ month }).catch(() => null);
    setData(d);
  }, [month]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Palette resolution. pot.color is a theme key ('cream'/'mint'/…); resolve
  // it via potBg() and fall back to the shared chart palette for the
  // synthetic 'Other' bucket (which has no key).
  const pal = useMemo(() => palette(F), [F]);
  const flowsColored = useMemo(() => {
    if (!data?.flows) return [];
    return data.flows.map((f, i) => ({
      ...f,
      color: f.color ? potBg(F, f.color) : pal[i % pal.length],
    }));
  }, [data, pal, F]);

  const winW = Dimensions.get('window').width;
  const chartW = Math.max(280, winW - 32);
  const chartH = Math.max(220, Math.min(420, (flowsColored.length || 1) * 44 + 80));
  const layout = useMemo(
    () => (flowsColored.length ? sankeyLayout(flowsColored, chartW, chartH) : null),
    [flowsColored, chartW, chartH],
  );

  const handleFlowTap = useCallback((flow) => {
    if (flow.category_id == null) {
      setOtherOpen(true);
      return;
    }
    navigation.navigate('PotDetail', {
      potId: flow.category_id,
      potName: `${flow.emoji ? flow.emoji + ' ' : ''}${flow.name}`,
    });
  }, [navigation]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}
    >
      <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
        Money <Text style={{ color: F.coral, fontStyle: 'italic' }}>flow</Text>
      </Text>
      <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
        {formatMonth(month)}
      </Text>

      {/* ── Header strip ──────────────────────────────────────── */}
      {data && (
        <View style={{ marginTop: 14, padding: 14, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {data.leftLabel}
              </Text>
              <Text style={{ fontSize: 20, color: F.ink, fontWeight: '700', marginTop: 2 }}>
                {formatRupees(data.leftValue, sym)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Spent
              </Text>
              <Text style={{ fontSize: 20, color: F.coral, fontWeight: '700', marginTop: 2 }}>
                {formatRupees(data.total, sym)}
              </Text>
            </View>
            {data.leftValue > 0 && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Allocated
                </Text>
                <Text style={{ fontSize: 20, color: F.ink, fontWeight: '700', marginTop: 2 }}>
                  {Math.round((data.total / data.leftValue) * 100)}%
                </Text>
              </View>
            )}
          </View>
          {data.fallback === 'budget' && (
            <Text style={{ fontSize: 11, color: F.ink3, marginTop: 8 }}>
              No income logged for this month — using total budget as the source.
            </Text>
          )}
        </View>
      )}

      {/* ── Sankey ──────────────────────────────────────────────── */}
      {!data && (
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 18 }}>Loading…</Text>
      )}

      {data && data.fallback === 'none' && (
        <View style={{ marginTop: 24, padding: 20, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 32 }}>🌊</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600', marginTop: 8, textAlign: 'center' }}>
            Add income or set budgets to see your money flow
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Add')}
              style={{ backgroundColor: F.coral, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Add income</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditPot')}
              style={{ backgroundColor: F.surface, borderWidth: 1, borderColor: F.line, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}>
              <Text style={{ color: F.ink, fontWeight: '600' }}>Set budgets</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {data && data.fallback !== 'none' && flowsColored.length === 0 && (
        <View style={{ marginTop: 24, padding: 20, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: F.ink2, textAlign: 'center' }}>
            No category spend recorded in {formatMonth(month)} yet.
          </Text>
        </View>
      )}

      {layout && Svg && (
        <View style={{ marginTop: 18 }}>
          <Svg width={chartW} height={chartH}>
            {/* left node */}
            <Rect x={layout.left.x} y={layout.left.y} width={layout.left.w} height={layout.left.h} fill={F.ink} rx={4}/>
            {/* links (rendered before right nodes so node rectangles sit on top) */}
            {layout.links.map((lk, i) => (
              <Path
                key={`lk-${i}`}
                d={lk.d}
                stroke={lk.color}
                strokeWidth={lk.strokeW}
                fill="none"
                opacity={0.55}
              />
            ))}
            {/* right nodes */}
            {layout.right.map((r, i) => (
              <Rect key={`r-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.color} rx={3}/>
            ))}
          </Svg>

          {/* Touchable hit-zones laid over the right nodes — easier and more
              reliable than overlaying invisible svg paths and works in the
              dev shell where Svg is null. */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {layout.right.map((r, i) => {
              const flow = flowsColored[i];
              return (
                <TouchableOpacity
                  key={`hit-${i}`}
                  onPress={() => handleFlowTap(flow)}
                  activeOpacity={0.7}
                  style={{
                    position: 'absolute',
                    left: r.x - 80,
                    top: r.y - 4,
                    width: 80 + r.w + 4,
                    height: Math.max(28, r.h + 8),
                    justifyContent: 'center',
                    paddingRight: r.w + 6,
                    alignItems: 'flex-end',
                  }}>
                  <Text numberOfLines={1} style={{ fontSize: 11, color: F.ink, fontWeight: '600', maxWidth: 80 }}>
                    {flow.emoji ? flow.emoji + ' ' : ''}{flow.name}
                  </Text>
                  <Text style={{ fontSize: 10, color: F.ink3 }}>
                    {formatRupees(flow.value, sym)} · {Math.round((flow.share || 0) * 100)}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Dev-shell fallback list — also a screen-reader-friendly backup. */}
      {layout && !Svg && (
        <View style={{ marginTop: 18 }}>
          {flowsColored.map((f) => (
            <TouchableOpacity
              key={`fb-${f.name}`}
              onPress={() => handleFlowTap(f)}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: F.line }}>
              <Text style={{ color: F.ink }}>{f.emoji ? f.emoji + ' ' : ''}{f.name}</Text>
              <Text style={{ color: F.ink2 }}>{formatRupees(f.value, sym)} · {Math.round((f.share || 0) * 100)}%</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={{ fontSize: 10, color: F.ink3, marginTop: 24, textAlign: 'center', lineHeight: 14 }}>
        Width of each flow ∝ category share of {data?.fallback === 'budget' ? 'budget' : 'spend'} this month.
      </Text>

      {/* ── Other bucket sheet ─────────────────────────────────── */}
      <Modal visible={otherOpen} animationType="slide" transparent onRequestClose={() => setOtherOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: F.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 16, paddingBottom: insets.bottom + 16, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: F.ink, fontWeight: '700' }}>Other categories</Text>
              <TouchableOpacity onPress={() => setOtherOpen(false)}>
                <Text style={{ fontSize: 22, color: F.ink3 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ marginTop: 12 }}>
              {(data?.collapsed || []).map((c) => (
                <TouchableOpacity
                  key={`col-${c.category_id}`}
                  onPress={() => {
                    setOtherOpen(false);
                    navigation.navigate('PotDetail', {
                      potId: c.category_id,
                      potName: `${c.emoji ? c.emoji + ' ' : ''}${c.name}`,
                    });
                  }}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: F.line }}>
                  <Text style={{ color: F.ink, fontSize: 14 }}>{c.emoji ? c.emoji + ' ' : ''}{c.name}</Text>
                  <Text style={{ color: F.ink2, fontSize: 14 }}>{formatRupees(c.value, sym)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default React.memo(MoneyFlow);
