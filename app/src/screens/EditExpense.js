import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { MoodPicker } from '../components/UI';

const MOODS = ['😍', '😌', '😐', '😬', '😞'];

export default function EditExpense({ route, navigation }) {
  const { F, sym, expenses, pots, updateExpense } = useApp();
  const insets = useSafeAreaInsets();
  const e = expenses.find(x => x.id === route.params.id);

  const [merchant, setMerchant]   = useState(e?.merchant || '');
  const [amount, setAmount]       = useState(e ? String(e.amount) : '');
  const [categoryId, setCategoryId] = useState(e?.category_id || null);
  const [date, setDate]           = useState(e?.expense_date || '');
  const [notes, setNotes]         = useState(e?.notes || '');
  const initialMoodIdx = e?.mood ? MOODS.indexOf(e.mood) : 1;
  const [moodIdx, setMoodIdx]     = useState(initialMoodIdx >= 0 ? initialMoodIdx : 1);
  const [recurring, setRecurring] = useState(!!e?.recurring);

  if (!e) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: F.bg }}>
      <Text style={{ color: F.ink2 }}>Expense not found</Text>
    </View>
  );

  const save = async () => {
    if (!merchant.trim()) return Alert.alert('Merchant required');
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) return Alert.alert('Enter a valid amount');
    await updateExpense(e.id, {
      merchant: merchant.trim(),
      amount: amt,
      category_id: categoryId,
      expense_date: date || e.expense_date,
      mood: MOODS[moodIdx],
      recurring,
      notes: notes.trim() || null,
    });
    navigation.goBack();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>MERCHANT</Text>
      <TextInput value={merchant} onChangeText={setMerchant}
        autoCapitalize="words"
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>AMOUNT</Text>
      <TextInput value={amount}
        onChangeText={t => setAmount(t.replace(/[^0-9.]/g, ''))}
        keyboardType="decimal-pad"
        placeholder={`${sym}0.00`} placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 24, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>DATE</Text>
      <TextInput value={date} onChangeText={setDate}
        placeholder="YYYY-MM-DD" placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 15, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>CATEGORY</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {pots.map(p => {
            const sel = categoryId === p.id;
            return (
              <TouchableOpacity key={p.id} onPress={() => setCategoryId(p.id)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line,
                  flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14 }}>{p.emoji}</Text>
                <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink, fontWeight: sel ? '600' : '500' }}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>MOOD</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: F.line, marginBottom: 14 }}>
        <MoodPicker value={moodIdx} onChange={setMoodIdx} F={F}/>
      </View>

      <TouchableOpacity onPress={() => setRecurring(!recurring)}
        style={{ padding: 14, borderRadius: 12, backgroundColor: recurring ? F.lilac : F.surface,
          borderWidth: 1, borderColor: F.line, flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 14 }}>
        <Text style={{ color: F.ink, fontSize: 14, fontWeight: '500' }}>🔄 Recurring monthly</Text>
        <Text style={{ color: F.ink2, fontSize: 13 }}>{recurring ? 'Yes' : 'No'}</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>NOTES</Text>
      <TextInput value={notes} onChangeText={setNotes}
        placeholder="Optional" placeholderTextColor={F.ink3}
        multiline
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink, minHeight: 70,
          textAlignVertical: 'top', marginBottom: 24 }}/>

      <TouchableOpacity onPress={save}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Save changes</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
