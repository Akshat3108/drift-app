// PS-22 — Financial Health Score detail breakdown.
//
// Reads `financialHealthScore()` (cached 12 h via analytics_cache) and renders:
//   1. Hero ring with the composite 0–100 score.
//   2. One card per non-null component — name, sub-score bar, rationale, and
//      a drill-in CTA to the source surface (BudgetSetup / Subs / NetWorth /
//      EMI / Trends).
// Empty-state (score === null) when the install has < 30 days of expense
// history, OR every component returned null.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { financialHealthScore } from '../../../analytics';
import { logError } from '@core/utils/log';

function scoreBand(score, F) {
  if (score == null) return { tint: F.ink3, label: '—' };
  if (score >= 80) return { tint: F.sageD, label: 'Healthy' };
  if (score >= 60) return { tint: F.olive ?? F.sageD, label: 'Stable' };
  if (score >= 40) return { tint: F.saffronD ?? F.coral, label: 'Stretched' };
  return { tint: F.coral, label: 'At risk' };
}

export default function HealthDetail({ navigation }) {
  const { F } = useApp();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    try {
      const result = await financialHealthScore({ force });
      setData(result);
    } catch (e) {
      logError('healthDetail.load', e);
      setData({ score: null, components: [], data_age_days: 0 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const band = scoreBand(data?.score, F);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{
        paddingTop: 16,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 20,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral} colors={[F.coral]}/>}
    >
      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 20, alignItems: 'center' }}>
        <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>
          FINANCIAL HEALTH
        </Text>
        <Text style={{ fontSize: 56, color: band.tint, fontWeight: '400', lineHeight: 64, marginTop: 8 }}>
          {data?.score ?? '—'}
          <Text style={{ fontSize: 22, color: F.ink3 }}> / 100</Text>
        </Text>
        <Text style={{ fontSize: 14, color: F.ink2, marginTop: 4 }}>
          {loading ? 'Loading…' : band.label}
        </Text>
        {data && data.data_age_days != null && (
          <Text style={{ fontSize: 11, color: F.ink3, marginTop: 6 }}>
            {data.score == null
              ? `Needs 30+ days of data (currently ${data.data_age_days})`
              : `Computed from ${data.components.length} signal${data.components.length === 1 ? '' : 's'} · cached 12 h`}
          </Text>
        )}
      </View>

      {data?.score == null ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: F.ink2, textAlign: 'center' }}>
            Add expenses + income for at least 30 days. The score blends six on-device signals
            — budget adherence, savings rate, subscription load, emergency fund, debt service,
            and your net-worth trend.
          </Text>
        </View>
      ) : (
        data.components.map((c) => (
          <ComponentCard key={c.name} c={c} F={F} navigation={navigation}/>
        ))
      )}
    </ScrollView>
  );
}

function ComponentCard({ c, F, navigation }) {
  const tint = c.value >= 80 ? F.sageD : c.value >= 40 ? (F.saffronD ?? F.coral) : F.coral;
  return (
    <TouchableOpacity
      onPress={() => c.drill && navigation.navigate(c.drill)}
      activeOpacity={c.drill ? 0.75 : 1}
      style={{ backgroundColor: F.cream, borderRadius: 18, padding: 16, marginBottom: 12 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>{c.label}</Text>
        <Text style={{ fontSize: 18, color: tint, fontWeight: '700' }}>{c.value}</Text>
      </View>
      <View style={{ height: 6, backgroundColor: F.surface, borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(2, c.value)}%`, height: '100%', backgroundColor: tint }}/>
      </View>
      <Text style={{ fontSize: 12, color: F.ink2, marginTop: 8 }}>{c.rationale}</Text>
      {c.drill && (
        <Text style={{ fontSize: 11, color: F.coral, marginTop: 6, fontWeight: '600' }}>
          Open {c.drill} →
        </Text>
      )}
    </TouchableOpacity>
  );
}
