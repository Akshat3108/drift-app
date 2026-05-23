// 6.15 — Lifestyle inflation screen.
//
// Reads `lifestyleInflation()` (6.7). Each category row shows:
//   - emoji + name
//   - share-of-spend drift in percentage points (this_share − prev_share)
//   - flagged badge (coral if rising lifestyle, sage if falling), or ink3 if
//     under the 5pp / 5%-prev-share thresholds
//   - absolute ₹ delta as a sub-line
//
// Rows are sorted by |share_drift| desc so the biggest mix-shift categories
// surface first — matches the engine's ordering decision (lifestyle.js:103).

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { lifestyleInflation } from '../../../analytics';

function formatPp(pp) {
  const sign = pp > 0 ? '+' : pp < 0 ? '−' : '';
  return `${sign}${Math.abs(pp * 100).toFixed(1)}pp`;
}

function LifestyleInflation() {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await lifestyleInflation();
    setData(res);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Lifestyle <Text style={{ color: F.coral, fontStyle: 'italic' }}>drift</Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6, lineHeight: 17 }}>
          Mix-shift in your spending over the last quarter vs the prior one.
          Categories whose share of total spend moved by ≥ 5pp (and were ≥ 5% before)
          are flagged — that's a real change in how you live, not just inflation.
        </Text>
      </View>

      {!data ? (
        <Text style={{ textAlign: 'center', color: F.ink3, padding: 40 }}>Loading…</Text>
      ) : !data.ready ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24,
          borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 10 }}>🌱</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600', marginBottom: 4 }}>
            Come back next quarter
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, textAlign: 'center' }}>
            We compare the last 3 months against the 3 months before that.{'\n'}
            Need at least one full prior quarter of spending to compute drift.
          </Text>
        </View>
      ) : (
        <>
          {/* Quarter totals header card */}
          <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 16,
            borderWidth: 1, borderColor: F.line, marginBottom: 12,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                This quarter
              </Text>
              <Text style={{ fontSize: 18, color: F.coral, fontWeight: '700' }}>
                {sym}{Number(data.total_this).toFixed(0)}
              </Text>
              <Text style={{ fontSize: 10, color: F.ink3 }}>from {data.this_q}</Text>
            </View>
            <Text style={{ fontSize: 16, color: F.ink3 }}>vs</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Prior quarter
              </Text>
              <Text style={{ fontSize: 18, color: F.ink2, fontWeight: '600' }}>
                {sym}{Number(data.total_prev).toFixed(0)}
              </Text>
              <Text style={{ fontSize: 10, color: F.ink3 }}>from {data.prev_q}</Text>
            </View>
          </View>

          {/* Category list */}
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, overflow: 'hidden' }}>
            {data.categories.length === 0 ? (
              <Text style={{ padding: 24, textAlign: 'center', color: F.ink3 }}>
                No category activity yet.
              </Text>
            ) : data.categories.map((c, i) => {
              const isRising  = c.flagged && c.share_drift > 0;
              const isFalling = c.flagged && c.share_drift < 0;
              const driftColor = isRising ? F.coral : isFalling ? F.sageD : F.ink3;
              const absDelta = c.this_spend - c.prev_spend;
              return (
                <View key={c.category_id ?? `unc-${i}`}
                  style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ flex: 1, fontSize: 14, color: F.ink, fontWeight: '500' }}>
                      {c.category_name}
                    </Text>
                    <View style={{
                      paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99,
                      backgroundColor: c.flagged
                        ? (isRising ? '#fde2dc' : F.mint)
                        : F.cream,
                    }}>
                      <Text style={{ fontSize: 11, color: driftColor, fontWeight: '700' }}>
                        {isRising ? '↑ ' : isFalling ? '↓ ' : ''}{formatPp(c.share_drift)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: F.ink3, marginTop: 4 }}>
                    {(c.prev_share * 100).toFixed(1)}% → {(c.this_share * 100).toFixed(1)}% of total
                    {' · '}
                    <Text style={{ color: absDelta > 0 ? F.coral : absDelta < 0 ? F.sageD : F.ink3 }}>
                      {absDelta > 0 ? '+' : absDelta < 0 ? '−' : ''}{sym}{Math.abs(absDelta).toFixed(0)}
                    </Text>
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={{ fontSize: 11, color: F.ink3, marginTop: 12, lineHeight: 16, textAlign: 'center' }}>
            Drift is computed as share-of-total this quarter minus share-of-total last quarter.
            A category growing in absolute rupees but staying the same share isn't a lifestyle change —
            it's inflation or a general spend uplift.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

export default React.memo(LifestyleInflation);
