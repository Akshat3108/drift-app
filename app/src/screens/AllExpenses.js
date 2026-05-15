import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { potBg } from '../theme';

export default function AllExpenses({ navigation, route }) {
  const { F, sym, pots, expenses } = useApp();
  const insets = useSafeAreaInsets();
  const initialPot = route.params?.potId || 'all';
  const [filter, setFilter] = useState(initialPot);

  const filtered = useMemo(
    () => filter === 'all' ? expenses : expenses.filter(e => e.category_id === filter),
    [filter, expenses],
  );
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      const day = e.expense_date || 'Other';
      if (!map[day]) map[day] = [];
      map[day].push(e);
    });
    return map;
  }, [filtered]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: F.line, backgroundColor: F.surface }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        <FilterPill active={filter === 'all'} onPress={() => setFilter('all')} F={F}>All</FilterPill>
        {pots.map(p => (
          <FilterPill key={p.id} active={filter === p.id} onPress={() => setFilter(p.id)} F={F}>
            {p.emoji} {p.label}
          </FilterPill>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <View style={{ backgroundColor: F.cream, borderRadius: 20, padding: 18, marginBottom: 18 }}>
          <Text style={{ fontSize: 12, color: F.ink2 }}>
            {filtered.length} {filtered.length === 1 ? 'spend' : 'spends'}
            {filter !== 'all' && ` · ${pots.find(p => p.id === filter)?.label || ''}`}
          </Text>
          <Text style={{ fontSize: 38, color: F.ink, fontWeight: '400', marginTop: 4 }}>
            {sym}{total.toFixed(2)}
          </Text>
        </View>

        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🌱</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>Nothing here yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4 }}>Tap + to add a spend</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([day, items]) => (
            <View key={day} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: F.ink2 }}>{day}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: F.line }}/>
                <Text style={{ fontSize: 12, color: F.ink3 }}>
                  {sym}{items.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                </Text>
              </View>
              <View style={{ backgroundColor: F.surface, borderRadius: 18,
                borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
                {items.map((e, i) => (
                  <TouchableOpacity key={e.id} onPress={() => navigation.navigate('Detail', { id: e.id })}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                      borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                    }}>
                    <View style={{
                      width: 42, height: 42, borderRadius: 13,
                      backgroundColor: potBg(F, e.category_color || 'cream'),
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 20 }}>{e.category_emoji || '💰'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>{e.merchant}</Text>
                      <Text style={{ fontSize: 12, color: F.ink2 }}>
                        {e.category_name || 'Uncategorised'}{e.mood ? `  ${e.mood}` : ''}
                        {e.recurring ? '  · recurring' : ''}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 16, color: F.ink }}>−{sym}{e.amount.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function FilterPill({ active, onPress, F, children }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
        backgroundColor: active ? F.coral : F.cream,
        borderWidth: 1, borderColor: active ? F.coral : F.line,
      }}>
      <Text style={{
        fontSize: 12, fontWeight: active ? '700' : '500',
        color: active ? '#fff' : F.ink,
      }}>{children}</Text>
    </TouchableOpacity>
  );
}
