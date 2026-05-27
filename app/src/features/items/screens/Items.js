import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../../hooks/useAppState';
import { useItemActions } from '@features/items/context';
import ItemSummaryRow from '@features/items/components/ItemSummaryRow';
import { withProfiler } from '@core/utils/perf';

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.display_name.toLowerCase().includes(q));
  }, [rows, query]);

  // 8.3 — stable per-row callback; receives the item identity needed to
  // navigate to its trend screen.
  const onRowPress = useCallback((normalizedName, displayName) => {
    navigation.navigate('ItemTrend', { normalizedName, displayName });
  }, [navigation]);

  const renderItem = useCallback(({ item }) => (
    <ItemSummaryRow item={item} F={F} sym={sym} onPress={onRowPress} />
  ), [F, sym, onRowPress]);

  const keyExtractor = useCallback((item) => item.normalized_name, []);

  const ListEmpty = useMemo(() => {
    if (loading) return null;
    return (
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
    );
  }, [loading, query, F]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
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

      <FlatList
        style={{ flex: 1 }}
        data={visible}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={F.coral} />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        ListEmptyComponent={ListEmpty}
        removeClippedSubviews
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={11}
      />
    </View>
  );
}

export default React.memo(withProfiler('Items', Items));
