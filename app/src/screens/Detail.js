import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useApp } from '../hooks/useAppState';

const MOOD_LABELS = { '😍': 'Loved it', '😌': 'Worth it', '😐': 'Neutral', '😬': 'Unsure', '😞': 'Regret' };

export default function Detail({ route, navigation }) {
  const { F, sym, expenses, removeExpense, repos } = useApp();
  const { id } = route.params;
  const e = expenses.find(x => x.id === id);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (e?.id) {
      repos.items.listByExpense(e.id).then(setItems).catch(() => setItems([]));
    }
  }, [e?.id, repos]);

  if (!e) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: F.bg }}>
      <Text style={{ color: F.ink2 }}>Expense not found</Text>
    </View>
  );

  const similar = expenses.filter(x => x.category_id === e.category_id && x.id !== e.id).slice(0, 3);

  const handleDelete = () => {
    Alert.alert('Delete this expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await removeExpense(e.id);
        navigation.goBack();
      } },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
      <View style={{ backgroundColor: F.cream, borderRadius: 26, padding: 24,
        alignItems: 'center', marginTop: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 52 }}>{e.category_emoji || '💰'}</Text>
        <Text style={{ fontSize: 48, color: F.ink, fontWeight: '400', marginTop: 8 }}>
          {sym}{e.amount.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 18, color: F.ink, marginTop: 6 }}>{e.merchant}</Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginTop: 4 }}>
          {e.expense_date} · {e.category_name || 'Uncategorised'}
        </Text>
      </View>

      {e.mood && (
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
      )}

      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 16 }}>
        {[
          ['Category', e.category_name || 'Uncategorised'],
          ['Date',     e.expense_date],
          ...(e.carbon ? [['Carbon', `${e.carbon} kg CO₂e`]] : []),
          ['Recurring', e.recurring ? 'Monthly' : 'One-time'],
          ...(e.notes ? [['Notes', e.notes]] : []),
        ].map(([l, v], i) => (
          <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between',
            padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
            <Text style={{ fontSize: 14, color: F.ink2 }}>{l}</Text>
            <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500', maxWidth: '60%', textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
      </View>

      {items.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 16, color: F.ink, marginBottom: 10 }}>Items on this receipt</Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, overflow: 'hidden' }}>
            {items.map((it, i) => (
              <TouchableOpacity
                key={it.id}
                onPress={() => navigation.navigate('ItemTrend', { normalizedName: it.normalized_name, displayName: it.name })}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                  borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: F.cream,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>{it.kind === 'produce' ? '🥬' : '🛒'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500', textTransform: 'capitalize' }}>
                    {it.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    {it.qty} {it.unit} · {sym}{it.unit_price.toFixed(2)}/{it.canonical_unit}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: F.ink }}>{sym}{it.price.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {similar.length > 0 && (
        <View>
          <Text style={{ fontSize: 16, color: F.ink, marginBottom: 10 }}>
            More in {e.category_name || 'this category'}
          </Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, overflow: 'hidden', marginBottom: 16 }}>
            {similar.map((s, i) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => navigation.replace('Detail', { id: s.id })}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                <Text style={{ fontSize: 20 }}>{s.category_emoji || '💰'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: F.ink }}>{s.merchant}</Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>{s.expense_date}</Text>
                </View>
                <Text style={{ fontSize: 14, color: F.ink }}>{sym}{s.amount.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          onPress={() => navigation.navigate('EditExpense', { id: e.id })}
          style={{ flex: 1, padding: 14, borderRadius: 12,
            backgroundColor: F.surface, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ color: F.ink, fontWeight: '600' }}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDelete}
          style={{ flex: 1, padding: 14, borderRadius: 12,
            backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca', alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '600' }}>Delete</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
