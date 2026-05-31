// 6.13 — Inflation index screen.
//
// Reads `inflationBasket()` (6.4). Renders the monthly index as an SVG
// line chart (base month = 1.00, marked with a dashed reference line) plus
// side-by-side Top Risers / Top Fallers cards listing the items with the
// largest unit-price ratio shift since the base month.
//
// SVG is lazy-required so the dev shell without a native rebuild falls
// back to a static "rebuild needed" empty-state for the chart only — the
// risers/fallers cards still work.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { inflationBasket } from '../../../analytics';
import { all } from '../../../db';
import TrendChart from '@components/charts/TrendChart';

const MONTHS_ABBREV = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthLabel(monthKey) {
  if (!monthKey || !monthKey.includes('-')) return '';
  const [y, m] = monthKey.split('-').map((n) => parseInt(n, 10));
  if (!Number.isFinite(m)) return '';
  return `${MONTHS_ABBREV[m - 1]} '${String(y).slice(-2)}`;
}

// Pure pricing helper — returns top-N risers + fallers given the basket
// items + their latest-vs-base price ratio. Exported for /tmp/ testing.
export function rankRisersFallers(items, currentByName, n = 3) {
  if (!items?.length || !currentByName) return { risers: [], fallers: [] };
  const enriched = items
    .map((it) => {
      const cur = currentByName.get(it.normalized_name);
      if (cur == null || cur <= 0 || it.base_price <= 0) return null;
      const ratio = cur / it.base_price;
      return {
        normalized_name: it.normalized_name,
        base_price: it.base_price,
        current_price: cur,
        ratio,
        pct_change: (ratio - 1) * 100,
        weight: it.weight,
      };
    })
    .filter(Boolean);
  const risers  = enriched.filter((e) => e.ratio > 1).sort((a, b) => b.ratio - a.ratio).slice(0, n);
  const fallers = enriched.filter((e) => e.ratio < 1).sort((a, b) => a.ratio - b.ratio).slice(0, n);
  return { risers, fallers };
}

function InflationIndex({ navigation }) {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(null);
  // Latest per-item price (in the most recent month containing each basket
  // item). Used to compute risers/fallers vs base_price.
  const [latestByName, setLatestByName] = useState(new Map());

  const load = useCallback(async () => {
    const res = await inflationBasket();
    setData(res);
    setSelectedIdx(null);
    if (res?.ready) {
      // For each basket item, fetch its most-recent live avg unit_price.
      // One small parameterised query — basket is bounded at 20 items.
      const names = res.items.map((it) => it.normalized_name);
      if (names.length > 0) {
        const placeholders = names.map(() => '?').join(',');
        const rows = await all(
          `SELECT normalized_name,
                  AVG(unit_price) AS p,
                  MAX(purchase_date) AS last_seen
             FROM receipt_items
            WHERE deleted_at IS NULL
              AND unit_price > 0
              AND normalized_name IN (${placeholders})
              AND substr(purchase_date, 1, 7) = (
                SELECT MAX(substr(purchase_date, 1, 7))
                  FROM receipt_items
                 WHERE deleted_at IS NULL
                   AND unit_price > 0
                   AND normalized_name = receipt_items.normalized_name
              )
            GROUP BY normalized_name`,
          names
        );
        const m = new Map();
        for (const r of rows) m.set(r.normalized_name, r.p);
        setLatestByName(m);
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const { risers, fallers } = useMemo(
    () => data?.ready ? rankRisersFallers(data.items, latestByName, 3) : { risers: [], fallers: [] },
    [data, latestByName]
  );

  const monthly = data?.ready ? data.monthly : [];
  const latestIndex = monthly.length ? monthly[monthly.length - 1].index : null;
  const indexPct = latestIndex != null ? (latestIndex - 1) * 100 : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Personal <Text style={{ color: F.coral, fontStyle: 'italic' }}>inflation</Text>
        </Text>
        {data?.ready && indexPct != null ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
              <Text style={{ fontSize: 36, color: indexPct > 0 ? F.coral : F.sageD, fontWeight: '700' }}>
                {indexPct > 0 ? '+' : ''}{indexPct.toFixed(1)}%
              </Text>
              <Text style={{ fontSize: 13, color: F.ink2 }}>vs {monthLabel(data.base_month)}</Text>
            </View>
            <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6, lineHeight: 17 }}>
              Built from your top-{data.items.length} most-purchased items, each capped at 10%
              of the basket so a single item can't dominate.
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 12, color: F.ink2, marginTop: 8 }}>
            Tracks unit-price changes across the items you buy most.
          </Text>
        )}
      </View>

      {!data ? (
        <Text style={{ textAlign: 'center', color: F.ink3, padding: 40 }}>Loading…</Text>
      ) : !data.ready ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24,
          borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 10 }}>📊</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
            {reasonHeadline(data.reason)}
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 6, textAlign: 'center' }}>
            {reasonBody(data.reason)}
          </Text>
        </View>
      ) : (
        <>
          {/* Line chart */}
          <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 18,
            borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 12 }}>
              Index over time (base {monthLabel(data.base_month)} = 1.00)
            </Text>

            {selectedIdx !== null && monthly[selectedIdx] && (
              <View style={{ backgroundColor: F.cream, borderRadius: 12, padding: 10,
                marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
                    {monthLabel(monthly[selectedIdx].month_key)}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    {monthly[selectedIdx].contributing_items} basket item{monthly[selectedIdx].contributing_items === 1 ? '' : 's'} present
                  </Text>
                </View>
                <Text style={{ fontSize: 18, color: F.coral, fontWeight: '700' }}>
                  {monthly[selectedIdx].index.toFixed(3)}
                </Text>
              </View>
            )}

            {monthly.length < 2 ? (
              <Text style={{ textAlign: 'center', color: F.ink3, padding: 24 }}>
                Need ≥ 2 months for a chart.
              </Text>
            ) : (
              <TrendChart
                chartId="inflation.index"
                series={monthly.map((m) => ({
                  value: m.index, label: monthLabel(m.month_key).slice(0, 3), key: m.month_key,
                }))}
                allow={['line', 'area', 'bar', 'dot']}
                defaultType="line"
                height={170}
                zeroBased={false}
                color={F.coral}
                refLine={{ value: 1.0, label: '1.00' }}
                selectedIndex={selectedIdx}
                onSelectIndex={(i) => setSelectedIdx(i)}
                showInspectLabel={false}
                formatValue={(v) => Number(v).toFixed(3)}
              />
            )}
          </View>

          {/* Risers / Fallers */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <RisersCard title="Top risers" rows={risers} F={F} sym={sym}
              navigation={navigation} accentColor={F.coral} arrow="↑"/>
            <RisersCard title="Top fallers" rows={fallers} F={F} sym={sym}
              navigation={navigation} accentColor={F.sageD} arrow="↓"/>
          </View>

          {/* Basket composition */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 11, color: F.ink3, textTransform: 'uppercase',
              letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 }}>
              Basket ({data.items.length} items)
            </Text>
            <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
              borderColor: F.line, overflow: 'hidden' }}>
              {data.items.map((it, i) => (
                <TouchableOpacity key={it.normalized_name}
                  onPress={() => navigation.navigate('ItemTrend', {
                    normalizedName: it.normalized_name, displayName: it.normalized_name,
                  })}
                  activeOpacity={0.7}
                  style={{ padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                    flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: F.ink, fontWeight: '500', textTransform: 'capitalize' }}>
                      {it.normalized_name}
                    </Text>
                    <Text style={{ fontSize: 10, color: F.ink3 }}>
                      base {sym}{Number(it.base_price).toFixed(2)} · weight {(it.weight * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: F.ink3 }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function RisersCard({ title, rows, F, sym, navigation, accentColor, arrow }) {
  return (
    <View style={{ flex: 1, backgroundColor: F.surface, borderRadius: 18,
      borderWidth: 1, borderColor: F.line, padding: 12 }}>
      <Text style={{ fontSize: 11, color: F.ink3, textTransform: 'uppercase',
        letterSpacing: 0.6, marginBottom: 8 }}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={{ fontSize: 11, color: F.ink3, padding: 12, textAlign: 'center' }}>
          None
        </Text>
      ) : rows.map((r, i) => (
        <TouchableOpacity key={r.normalized_name}
          onPress={() => navigation.navigate('ItemTrend', {
            normalizedName: r.normalized_name, displayName: r.normalized_name,
          })}
          activeOpacity={0.7}
          style={{ paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
          <Text numberOfLines={1} style={{ fontSize: 12, color: F.ink, fontWeight: '500', textTransform: 'capitalize' }}>
            {r.normalized_name}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 10, color: F.ink3 }}>
              {sym}{r.base_price.toFixed(2)} → {sym}{r.current_price.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 12, color: accentColor, fontWeight: '700' }}>
              {arrow} {Math.abs(r.pct_change).toFixed(0)}%
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function reasonHeadline(reason) {
  switch (reason) {
    case 'no_priced_items':  return 'No priced items yet';
    case 'no_basket':        return 'No basket yet';
    case 'no_base_month':    return 'Need more history';
    case 'base_month_thin':  return 'Need a denser base month';
    default: return 'Not enough data';
  }
}
function reasonBody(reason) {
  switch (reason) {
    case 'no_priced_items':  return 'Scan a few receipts so we can extract unit prices.';
    case 'no_basket':        return 'We need item-level price data across multiple receipts.';
    case 'no_base_month':    return 'No single month yet has ≥ 5 of your top items together. Keep logging.';
    case 'base_month_thin':  return 'The earliest dense month has < 5 priced items. A couple more receipts should fix this.';
    default: return 'Keep logging items and check back soon.';
  }
}

export default React.memo(InflationIndex);
