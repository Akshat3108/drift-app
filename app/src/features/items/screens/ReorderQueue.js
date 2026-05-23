// 6.17 — Reorder queue screen.
//
// Reads `reorderQueue()` (6.6) and groups items into three sections:
//   - Overdue   (due_in_days < 0)
//   - Imminent  (0..3)
//   - Upcoming  (> 3)
// Item rows tap into ItemTrend for the underlying price/consumption history.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { reorderQueue } from '../../../analytics';

function StatusChip({ count, label, color, F }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 22, color, fontWeight: '700' }}>{count}</Text>
      <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </Text>
    </View>
  );
}

function ItemRow({ item, navigation, F }) {
  const isOverdue = item.status === 'overdue';
  const isImminent = item.status === 'imminent';
  const accent = isOverdue ? F.coral : isImminent ? '#e67e22' : F.sageD;

  let dueLabel;
  if (isOverdue) {
    const days = Math.abs(item.due_in_days);
    dueLabel = `${days}d overdue`;
  } else if (item.due_in_days === 0) {
    dueLabel = 'due today';
  } else {
    dueLabel = `due in ${item.due_in_days}d`;
  }

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('ItemTrend', {
        normalizedName: item.normalized_name, displayName: item.display_name,
      })}
      activeOpacity={0.7}
      style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: accent }}/>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500', textTransform: 'capitalize' }}>
          {item.display_name}
        </Text>
        <Text style={{ fontSize: 11, color: F.ink3 }}>
          usually every ~{item.avg_interval_days}d · last {item.last_seen}
        </Text>
      </View>
      <Text style={{ fontSize: 12, color: accent, fontWeight: '700' }}>
        {dueLabel}
      </Text>
    </TouchableOpacity>
  );
}

function Section({ title, items, navigation, F }) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 11, color: F.ink3, textTransform: 'uppercase',
        letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 }}>
        {title} ({items.length})
      </Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden' }}>
        {items.map((it, i) => (
          <View key={it.normalized_name}
            style={{ borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
            <ItemRow item={it} navigation={navigation} F={F}/>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReorderQueue({ navigation }) {
  const { F } = useApp();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await reorderQueue();
    setData(res);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const grouped = useMemo(() => {
    if (!data?.ready) return null;
    const overdue  = data.items.filter((it) => it.status === 'overdue');
    const imminent = data.items.filter((it) => it.status === 'imminent');
    const upcoming = data.items.filter((it) => it.status === 'upcoming');
    return { overdue, imminent, upcoming };
  }, [data]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Time to <Text style={{ color: F.coral, fontStyle: 'italic' }}>restock</Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6, lineHeight: 17 }}>
          Items you buy on a regular cadence. Tap a row to see the price + consumption
          history that drove the prediction.
        </Text>
      </View>

      {!data ? (
        <Text style={{ textAlign: 'center', color: F.ink3, padding: 40 }}>Loading…</Text>
      ) : !data.ready ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24,
          borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 10 }}>🛒</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600', marginBottom: 4 }}>
            Nothing to reorder yet
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, textAlign: 'center' }}>
            Scan a few receipts of repeat purchases to build a cadence.{'\n'}
            We need an item to appear ≥ 3 times before predicting when it's due.
          </Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', backgroundColor: F.surface,
            borderRadius: 18, borderWidth: 1, borderColor: F.line,
            padding: 16, marginBottom: 16 }}>
            <StatusChip count={grouped.overdue.length}  label="Overdue"  color={F.coral} F={F}/>
            <View style={{ width: 1, backgroundColor: F.line, marginHorizontal: 6 }}/>
            <StatusChip count={grouped.imminent.length} label="Imminent" color="#e67e22" F={F}/>
            <View style={{ width: 1, backgroundColor: F.line, marginHorizontal: 6 }}/>
            <StatusChip count={grouped.upcoming.length} label="Upcoming" color={F.sageD} F={F}/>
          </View>

          <Section title="Overdue"  items={grouped.overdue}  navigation={navigation} F={F}/>
          <Section title="Imminent" items={grouped.imminent} navigation={navigation} F={F}/>
          <Section title="Upcoming" items={grouped.upcoming} navigation={navigation} F={F}/>

          {data.items.length === 0 && (
            <View style={{ backgroundColor: F.mint, borderRadius: 18, padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, marginBottom: 10 }}>✓</Text>
              <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>You're stocked up</Text>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 4 }}>
                No reorder predictions are due in the near term.
              </Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

export default React.memo(ReorderQueue);
