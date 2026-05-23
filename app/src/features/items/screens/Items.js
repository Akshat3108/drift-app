import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../../hooks/useAppState';
import { useItemActions } from '@features/items/context';
import { SparkBars } from '@components/primitives/SparkBars';

const KIND_EMOJI = { produce: '🥬', grocery: '🛒', other: '📦' };

function Items({ navigation, route }) {
  const { F, sym } = useApp();
  const { trackedItems } = useItemActions();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState(route.params?.filter || 'all');
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await trackedItems({ kind: filter });
      setRows(r);
    } finally {
      setLoading(false);
    }
  }, [filter, trackedItems]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 2.D.14 — client-side filter. `trackedItems` already loaded everything for
  // the kind tab; doing the contains-check here keeps keystroke latency at
  // O(N) over an in-memory array (always < 5ms in practice) instead of round-
  // tripping to SQL. Case-insensitive over display_name; normalized_name would
  // collapse stales like "Doodh" / "Milk" but display_name is what the user
  // sees, so match that for principle of least surprise.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.display_name.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      {/* 2.D.14 — search bar above the kind tabs. Surface card matches the
          rest of the chrome; the ✕ clear button only renders when typed in. */}
      <View style={{ backgroundColor: F.surface, paddingHorizontal: 16, paddingTop: 12,
        paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: F.cream, borderRadius: 14, paddingHorizontal: 12,
          borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 14 }} accessibilityElementsHidden>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search items"
            placeholderTextColor={F.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search tracked items"
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: F.ink }}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={{ padding: 4 }}>
              <Text style={{ fontSize: 14, color: F.ink2 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, backgroundColor: F.surface, borderBottomWidth: 1, borderBottomColor: F.line }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {[['all', 'All'], ['produce', 'Produce'], ['grocery', 'Grocery'], ['other', 'Other']].map(([k, l]) => {
          const sel = filter === k;
          return (
            <TouchableOpacity key={k} onPress={() => setFilter(k)}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Filter ${l}`}
              accessibilityState={{ selected: sel }}
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

        {visible.length === 0 && !loading && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>{query.trim() ? '🔎' : '📈'}</Text>
            <Text style={{ fontSize: 15, color: F.ink, fontWeight: '500' }}>
              {query.trim() ? 'No matches' : 'Nothing tracked yet'}
            </Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              {query.trim()
                ? `Nothing here matches "${query.trim()}".`
                : 'Scan a receipt to start tracking item prices and consumption.'}
            </Text>
          </View>
        )}

        {visible.map((r) => (
          <TouchableOpacity
            key={r.normalized_name}
            onPress={() => navigation.navigate('ItemTrend', { normalizedName: r.normalized_name, displayName: r.display_name })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${r.display_name}, ${sym}${r.last_unit_price.toFixed(2)} per ${r.canonical_unit}${r.change_pct !== null ? `, ${r.change_pct > 0 ? 'up' : 'down'} ${Math.abs(r.change_pct).toFixed(0)} percent` : ''}`}
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

export default React.memo(Items);
