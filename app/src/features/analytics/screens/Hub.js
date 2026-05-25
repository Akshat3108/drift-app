// 6.12 — Analytics Hub.
//
// Top-level analytics surface. Composes:
//   - 5 intelligence cards (velocity / inflation / lifestyle drift / sub
//     leakage / reorder queue), each linking out to a deeper screen.
//   - Reports section: rows to Forecast, Spending calendar, Variance,
//     Top merchants, Trends, Subscriptions.
//
// All five card datasources are getCached-wrapped engine functions; pull-
// to-refresh fires them in parallel.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import {
  spendingVelocity, inflationBasket, lifestyleInflation,
  subscriptionLeakage, reorderQueue,
} from '../../../analytics';

function Card({ title, emoji, body, sub, accent, F, onPress, dim }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{
        width: '48.5%',
        backgroundColor: F.surface, borderRadius: 18,
        padding: 14, borderWidth: 1, borderColor: F.line,
        opacity: dim ? 0.55 : 1,
      }}>
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase',
        letterSpacing: 0.6, marginTop: 6 }}>{title}</Text>
      <Text style={{ fontSize: 15, color: accent ?? F.ink, fontWeight: '700', marginTop: 4 }}>
        {body}
      </Text>
      {sub && (
        <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }} numberOfLines={2}>
          {sub}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function ReportRow({ icon, title, sub, F, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, borderTopWidth: 1, borderTopColor: F.line }}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>{title}</Text>
        {sub && <Text style={{ fontSize: 11, color: F.ink3 }}>{sub}</Text>}
      </View>
      <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
    </TouchableOpacity>
  );
}

function Hub({ navigation }) {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();

  const [velocity, setVelocity]   = useState(null);
  const [inflation, setInflation] = useState(null);
  const [lifestyle, setLifestyle] = useState(null);
  const [leakage, setLeakage]     = useState(null);
  const [reorder, setReorder]     = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [v, i, l, s, r] = await Promise.all([
      spendingVelocity().catch(() => null),
      inflationBasket().catch(() => null),
      lifestyleInflation().catch(() => null),
      subscriptionLeakage().catch(() => null),
      reorderQueue().catch(() => null),
    ]);
    setVelocity(v); setInflation(i); setLifestyle(l); setLeakage(s); setReorder(r);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // ─── Card content derivation ────────────────────────────────────────
  const velocityCard = (() => {
    if (!velocity) return { body: '—', sub: 'Loading', dim: true };
    if (velocity.classifier === 'insufficient') {
      return { body: 'No baseline', sub: 'Log a couple weeks of spending', dim: true };
    }
    const pctTxt = velocity.pctChange != null
      ? `${velocity.pctChange > 0 ? '+' : ''}${(velocity.pctChange * 100).toFixed(0)}%`
      : '—';
    return {
      body: pctTxt,
      sub: velocity.classifier === 'accelerating' ? 'Accelerating PoP'
         : velocity.classifier === 'slowing'      ? 'Slowing PoP'
         : 'Steady week-over-week',
      accent: velocity.classifier === 'accelerating' ? F.coral
            : velocity.classifier === 'slowing'      ? F.sageD : F.ink,
    };
  })();

  const inflationCard = (() => {
    if (!inflation) return { body: '—', sub: 'Loading', dim: true };
    if (!inflation.ready) return { body: 'Not yet', sub: 'Need more receipt data', dim: true };
    const latest = inflation.monthly[inflation.monthly.length - 1];
    if (!latest) return { body: 'Not yet', sub: 'Single-month baseline only', dim: true };
    const pct = (latest.index - 1) * 100;
    return {
      body: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
      sub: `${inflation.items.length}-item basket vs ${inflation.base_month}`,
      accent: pct > 0 ? F.coral : F.sageD,
    };
  })();

  const lifestyleCard = (() => {
    if (!lifestyle) return { body: '—', sub: 'Loading', dim: true };
    if (!lifestyle.ready) return { body: 'Not yet', sub: 'Need a full prior quarter', dim: true };
    const flagged = lifestyle.categories.filter((c) => c.flagged).length;
    return {
      body: flagged === 0 ? 'Steady' : `${flagged} cat${flagged === 1 ? '' : 's'}`,
      sub: flagged === 0 ? 'No major mix shifts this quarter'
                         : 'Spending mix is drifting',
      accent: flagged === 0 ? F.sageD : F.coral,
      dim: flagged === 0,
    };
  })();

  const leakageCard = (() => {
    if (!leakage) return { body: '—', sub: 'Loading', dim: true };
    const ratio = leakage.leakage_ratio;
    if (!Number.isFinite(ratio) || ratio === 0) {
      return { body: '—', sub: 'No subs yet', dim: true };
    }
    const pct = ratio * 100;
    return {
      body: `${pct.toFixed(1)}%`,
      sub: `${sym}${Math.round(leakage.monthly_subs_total)}/mo across ${leakage.subs_count} sub${leakage.subs_count === 1 ? '' : 's'}`,
      accent: pct > 15 ? F.coral : F.ink,
    };
  })();

  const reorderCard = (() => {
    if (!reorder) return { body: '—', sub: 'Loading', dim: true };
    if (!reorder.ready) return { body: 'None', sub: 'No repeat-buy items yet', dim: true };
    const overdue  = reorder.items.filter((it) => it.status === 'overdue').length;
    const imminent = reorder.items.filter((it) => it.status === 'imminent').length;
    const urgent = overdue + imminent;
    if (urgent === 0) return { body: 'Stocked', sub: `${reorder.items.length} items tracked`, dim: true, accent: F.sageD };
    return {
      body: `${urgent} item${urgent === 1 ? '' : 's'}`,
      sub: overdue > 0 ? `${overdue} overdue · ${imminent} imminent`
                       : `${imminent} due in 3d`,
      accent: overdue > 0 ? F.coral : '#e67e22',
    };
  })();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 100, paddingHorizontal: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}>

      <Text style={{ fontSize: 26, color: F.ink, marginBottom: 6, paddingHorizontal: 4 }}>
        Your <Text style={{ color: F.coral, fontStyle: 'italic' }}>analytics</Text>
      </Text>
      <Text style={{ fontSize: 12, color: F.ink2, marginBottom: 16, paddingHorizontal: 4 }}>
        Pull to refresh.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '3%', rowGap: 12, marginBottom: 16 }}>
        <Card title="Spending velocity" emoji="🚀" {...velocityCard} F={F}
          onPress={() => navigation.navigate('Trends')}/>
        <Card title="Personal inflation" emoji="📈" {...inflationCard} F={F}
          onPress={() => navigation.navigate('InflationIndex')}/>
        <Card title="Lifestyle drift" emoji="🌿" {...lifestyleCard} F={F}
          onPress={() => navigation.navigate('LifestyleInflation')}/>
        <Card title="Subscription leakage" emoji="🔄" {...leakageCard} F={F}
          onPress={() => navigation.navigate('Subs')}/>
        <Card title="Reorder queue" emoji="🛒" {...reorderCard} F={F}
          onPress={() => navigation.navigate('ReorderQueue')}/>
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, textTransform: 'uppercase',
        letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 }}>
        Reports
      </Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden' }}>
        {/* The first row uses borderTopWidth:0; ReportRow has borderTopWidth:1 by
            default so the first row gets a leading underline. We override by
            wrapping the first row in a 0-top-border container. */}
        <View style={{ borderTopWidth: 0 }}>
          <ReportRow icon="📊" title="Where it flowed" sub="Pots by month + YoY/MoM toggle"
            F={{ ...F, line: 'transparent' }}
            onPress={() => navigation.navigate('Trends')}/>
        </View>
        <ReportRow icon="🎯" title="End-of-month forecast"
          sub="3-model ensemble + confidence cone"
          F={F} onPress={() => navigation.navigate('Forecast')}/>
        <ReportRow icon="📅" title="Spending calendar"
          sub="Month-of-year + weekday + day-of-month"
          F={F} onPress={() => navigation.navigate('Calendar')}/>
        <ReportRow icon="🗓️" title="Spending day grid"
          sub="Where you spent each day this month"
          F={F} onPress={() => navigation.navigate('SpendCalendar')}/>
        <ReportRow icon="📐" title="Category variance"
          sub="Volatility heatmap"
          F={F} onPress={() => navigation.navigate('Variance')}/>
        <ReportRow icon="🏪" title="Top merchants"
          sub="Leaderboard + per-merchant detail"
          F={F} onPress={() => navigation.navigate('Merchants')}/>
        <ReportRow icon="📈" title="Tracked items"
          sub="Per-item price + consumption history"
          F={F} onPress={() => navigation.navigate('Items')}/>
        <ReportRow icon="🔁" title="Subscriptions"
          sub="Active + cancelled + suggested cancellations"
          F={F} onPress={() => navigation.navigate('Subs')}/>
        <ReportRow icon="🗓️" title="Subscription calendar"
          sub="Upcoming bills in a month grid"
          F={F} onPress={() => navigation.navigate('SubCalendar')}/>
        <ReportRow icon="🏦" title="EMIs & loans"
          sub="Amortization schedule + outstanding balance"
          F={F} onPress={() => navigation.navigate('EMI')}/>
        <ReportRow icon="⛽" title="Vehicles & fuel"
          sub="Per-vehicle fill-up history + mileage"
          F={F} onPress={() => navigation.navigate('Vehicles')}/>
        <ReportRow icon="🥗" title="Pantry"
          sub="Inventory + low-stock shopping list"
          F={F} onPress={() => navigation.navigate('Pantry')}/>
        <ReportRow icon="🔔" title="Price alerts"
          sub="Watch items that creep up"
          F={F} onPress={() => navigation.navigate('PriceAlerts')}/>
        <ReportRow icon="👥" title="People & splits"
          sub="Track who owes you what"
          F={F} onPress={() => navigation.navigate('People')}/>
        <ReportRow icon="💡" title="Utilities & bills"
          sub="Electricity, gas, internet, mobile + consumption trends"
          F={F} onPress={() => navigation.navigate('Utilities')}/>
        <ReportRow icon="📥" title="Import CSV statement"
          sub="HDFC, SBI, ICICI credit card — review then keep"
          F={F} onPress={() => navigation.navigate('CsvImport')}/>
      </View>

      <Text style={{ fontSize: 10, color: F.ink3, marginTop: 14, textAlign: 'center', lineHeight: 14 }}>
        Every metric is computed locally — nothing leaves your device.
      </Text>
    </ScrollView>
  );
}

export default React.memo(Hub);
