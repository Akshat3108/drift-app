import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../hooks/useAppState';
import { SparkBars } from '../components/UI';

const KIND_EMOJI = { produce: '🥬', grocery: '🛒', other: '📦' };

export default function Items({ navigation, route }) {
  const { F, sym, repos } = useApp();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState(route.params?.filter || 'all');
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await repos.items.trackedItems({ kind: filter });
      setRows(r);
    } finally {
      setLoading(false);
    }
  }, [filter, repos]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, backgroundColor: F.surface, borderBottomWidth: 1, borderBottomColor: F.line }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {[['all', 'All'], ['produce', 'Produce'], ['grocery', 'Grocery'], ['other', 'Other']].map(([k, l]) => {
          const sel = filter === k;
          return (
            <TouchableOpacity key={k} onPress={() => setFilter(k)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
                backgroundColor: sel ? F.coral : F.cream,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
              }}>
              <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink, fontWeight: sel ? '700' : '500' }}>
                {l}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={F.coral}/>}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

        {rows.length === 0 && !loading && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>📈</Text>
            <Text style={{ fontSize: 15, color: F.ink, fontWeight: '500' }}>Nothing tracked yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Scan a receipt to start tracking item prices and consumption.
            </Text>
          </View>
        )}

        {rows.map((r) => (
          <TouchableOpacity
            key={r.normalized_name}
            onPress={() => navigation.navigate('ItemTrend', { normalizedName: r.normalized_name, displayName: r.display_name })}
            activeOpacity={0.85}
            style={{ backgroundColor: F.surface, borderRadius: 18, padding: 16,
              borderWidth: 1, borderColor: F.line, marginBottom: 10 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: F.cream,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{KIND_EMOJI[r.kind] || '📦'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: F.ink, fontWeight: '600', textTransform: 'capitalize' }}>
                  {r.display_name}
                </Text>
                <Text style={{ fontSize: 12, color: F.ink3, marginTop: 2 }}>
                  {sym}{r.last_unit_price.toFixed(2)}/{r.canonical_unit}
                  {r.change_pct !== null && (
                    <Text style={{ color: r.change_pct > 0 ? F.coral : F.sageD, fontWeight: '700' }}>
                      {' '}{r.change_pct > 0 ? '↑' : '↓'} {Math.abs(r.change_pct).toFixed(0)}%
                    </Text>
                  )}
                </Text>
              </View>
              <View style={{ width: 64, height: 28 }}>
                {r.spark?.length > 1 && (
                  <SparkBars data={r.spark} color={F.coral} F={F} height={28}/>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ backgroundColor: F.mint, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, color: F.sageD, fontWeight: '600' }}>
                  {r.total_qty_30d.toFixed(r.canonical_unit === 'pcs' ? 0 : 2)} {r.canonical_unit} this month
                </Text>
              </View>
              <View style={{ backgroundColor: F.cream, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, color: F.ink2, fontWeight: '600' }}>
                  {r.points_count} buy{r.points_count === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
