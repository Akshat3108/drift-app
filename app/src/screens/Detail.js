import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';

const MOOD_LABELS = { '😍':'Loved it','😌':'Worth it','😐':'Neutral','😬':'Unsure','😞':'Regret' };

export default function Detail({ route, navigation }) {
  const { F, sym, expenses } = useApp();
  const insets = useSafeAreaInsets();
  const { id } = route.params;
  const e = expenses.find(x => x.id === id);

  if (!e) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: F.bg }}>
      <Text style={{ color: F.ink2 }}>Expense not found</Text>
    </View>
  );

  const similar = expenses.filter(x => x.cat === e.cat && x.id !== e.id).slice(0, 3);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
      {/* Hero */}
      <View style={{ backgroundColor: F.cream, borderRadius: 26, padding: 24,
        alignItems: 'center', marginTop: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 52 }}>{e.icon}</Text>
        <Text style={{ fontSize: 48, color: F.ink, fontWeight: '400', marginTop: 8 }}>
          {sym}{e.amount.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 18, color: F.ink, marginTop: 6 }}>{e.merchant}</Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginTop: 4 }}>{e.time} · {e.cat}</Text>
      </View>

      {/* Mood */}
      <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: F.line, flexDirection: 'row', alignItems: 'center',
        gap: 14, marginBottom: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: F.cream,
          alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 26 }}>{e.mood}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: F.ink2 }}>You felt</Text>
          <Text style={{ fontSize: 16, color: F.ink }}>{MOOD_LABELS[e.mood] || '—'}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 16 }}>
        {[
          ['Category', e.cat],
          ['Date', e.time],
          ['Carbon', `${e.carbon} kg CO₂e`],
          ['Recurring', e.recurring ? 'Monthly' : 'One-time'],
          ['Method', '•••• 4291'],
        ].map(([l, v], i) => (
          <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between',
            padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
            <Text style={{ fontSize: 14, color: F.ink2 }}>{l}</Text>
            <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>{v}</Text>
          </View>
        ))}
      </View>

      {/* Similar */}
      {similar.length > 0 && (
        <View>
          <Text style={{ fontSize: 16, color: F.ink, marginBottom: 10 }}>More in {e.cat}</Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, overflow: 'hidden', marginBottom: 16 }}>
            {similar.map((s, i) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                <Text style={{ fontSize: 20 }}>{s.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: F.ink }}>{s.merchant}</Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>{s.time}</Text>
                </View>
                <Text style={{ fontSize: 14, color: F.ink }}>{sym}{s.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: 12,
          backgroundColor: F.surface, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ color: F.ink, fontWeight: '600' }}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Alert.alert('Delete?', 'This cannot be undone', [
          { text: 'Delete', style: 'destructive', onPress: () => navigation.goBack() },
          { text: 'Cancel', style: 'cancel' },
        ])} style={{ flex: 1, padding: 14, borderRadius: 12,
          backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca', alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '600' }}>Delete</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
