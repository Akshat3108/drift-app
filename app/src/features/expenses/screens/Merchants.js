// 5.9 — Top-merchants leaderboard. Single repo call + window picker.
// Sibling of Items / ItemTrend conceptually: Profile → list → detail.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { expenses as expRepo } from '@features/expenses/repo';

const RANGE_PRESETS = [
  { key: '3',  label: '3 mo',  months: 3 },
  { key: '6',  label: '6 mo',  months: 6 },
  { key: '12', label: '12 mo', months: 12 },
  { key: '60', label: 'All',   months: 600 }, // 50 years — effectively all-time
];

function Merchants({ navigation }) {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState([]);
  const [rangeKey, setRangeKey] = useState('6');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const months = RANGE_PRESETS.find((p) => p.key === rangeKey)?.months ?? 6;
    const data = await expRepo.topMerchants({ months, limit: 50 });
    setRows(data);
  }, [rangeKey]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {RANGE_PRESETS.map((p) => {
          const sel = rangeKey === p.key;
          return (
            <TouchableOpacity key={p.key} onPress={() => setRangeKey(p.key)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 99,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
                alignItems: 'center' }}>
              <Text style={{ color: sel ? '#fff' : F.ink2, fontWeight: sel ? '700' : '500', fontSize: 12 }}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {rows.length === 0 ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🏪</Text>
          <Text style={{ fontSize: 14, color: F.ink2 }}>No merchants in this range yet</Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 6, textAlign: 'center' }}>
            Scan a receipt or type a merchant when adding a spend{'\n'}to start tracking by merchant.
          </Text>
        </View>
      ) : (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
          borderColor: F.line, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <TouchableOpacity key={r.id}
              onPress={() => navigation.navigate('MerchantDetail', {
                merchantId: r.id, displayName: r.name,
              })}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: F.cream,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, color: F.ink2, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>{r.name}</Text>
                <Text style={{ fontSize: 11, color: F.ink3 }}>
                  {r.txn_count} visit{r.txn_count === 1 ? '' : 's'}
                  {r.last_seen ? ` · last ${r.last_seen}` : ''}
                </Text>
              </View>
              <Text style={{ fontSize: 15, color: F.ink, fontWeight: '600' }}>
                {sym}{Number(r.total).toFixed(0)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

export default React.memo(Merchants);
