import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useItemActions } from '@features/items/context';
import { MoodPicker } from '@components/primitives/MoodPicker';
import PaymentPicker from '@components/primitives/PaymentPicker';
import ItemRows, { rowsFromExisting, toPersistedItems, rowsTotal } from '@components/ItemRows';

const MOODS = ['😍', '😌', '😐', '😬', '😞'];

function EditExpense({ route, navigation }) {
  const { F, sym, expenses, pots, updateExpense, updateExpenseWithItems } = useApp();
  const { listByExpense, replaceItems } = useItemActions();
  const insets = useSafeAreaInsets();
  const e = expenses.find(x => x.id === route.params.id);

  const [merchant, setMerchant]   = useState(e?.merchant || '');
  const [amount, setAmount]       = useState(e ? String(e.amount) : '');
  const [categoryId, setCategoryId] = useState(e?.category_id || null);
  const [date, setDate]           = useState(e?.expense_date || '');
  const [notes, setNotes]         = useState(e?.notes || '');
  const initialMoodIdx = e?.mood ? MOODS.indexOf(e.mood) : 1;
  const [moodIdx, setMoodIdx]     = useState(initialMoodIdx >= 0 ? initialMoodIdx : 1);
  const [moodOn, setMoodOn]       = useState(!!e?.mood);
  const [recurring, setRecurring] = useState(!!e?.recurring);
  const [paymentMethod, setPaymentMethod] = useState(e?.payment_method || null);
  const [rows, setRows]           = useState([]);
  const [hadItems, setHadItems]   = useState(false);
  const [useItems, setUseItems]   = useState(false);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!e?.id) return;
    listByExpense(e.id).then(list => {
      const existed = list.length > 0;
      setHadItems(existed);
      setUseItems(existed);
      setRows(existed ? rowsFromExisting(list) : []);
    }).catch(() => { setHadItems(false); setRows([]); });
  }, [e?.id, listByExpense]);

  const itemsSum = useMemo(() => rowsTotal(rows), [rows]);

  if (!e) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: F.bg }}>
      <Text style={{ color: F.ink2 }}>Expense not found</Text>
    </View>
  );

  const save = async () => {
    if (!merchant.trim()) return Alert.alert('Merchant required');
    setSaving(true);
    try {
      if (useItems) {
        const items = toPersistedItems(rows);
        if (items.length === 0) {
          setSaving(false);
          return Alert.alert('Add at least one item, or switch off the item list to keep just a total.');
        }
        const total = +items.reduce((s, it) => s + it.price, 0).toFixed(2);
        await updateExpenseWithItems(e.id, {
          merchant: merchant.trim(),
          amount: total,
          category_id: categoryId,
          expense_date: date || e.expense_date,
          mood: moodOn ? MOODS[moodIdx] : null,
          recurring,
          notes: notes.trim() || null,
          payment_method: paymentMethod,
        }, items);
      } else {
        const amt = parseFloat(amount);
        if (!isFinite(amt) || amt <= 0) { setSaving(false); return Alert.alert('Enter a valid amount'); }
        await updateExpense(e.id, {
          merchant: merchant.trim(),
          amount: amt,
          category_id: categoryId,
          expense_date: date || e.expense_date,
          mood: moodOn ? MOODS[moodIdx] : null,
          recurring,
          notes: notes.trim() || null,
          payment_method: paymentMethod,
        });
        if (hadItems) {
          await replaceItems(e.id, [], date || e.expense_date);
        }
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save', err.message || String(err));
    } finally { setSaving(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>MERCHANT</Text>
      <TextInput value={merchant} onChangeText={setMerchant}
        autoCapitalize="words"
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 14 }}/>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>
          {useItems ? 'TOTAL (from items)' : 'AMOUNT'}
        </Text>
        <TouchableOpacity onPress={() => setUseItems(v => !v)}>
          <Text style={{ color: F.coral, fontSize: 12, fontWeight: '600' }}>
            {useItems ? 'Use amount only' : 'Break into items'}
          </Text>
        </TouchableOpacity>
      </View>
      {useItems ? (
        <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.cream, marginBottom: 14 }}>
          <Text style={{ fontSize: 24, color: F.coral, fontWeight: '600' }}>{sym}{itemsSum.toFixed(2)}</Text>
        </View>
      ) : (
        <TextInput value={amount}
          onChangeText={t => setAmount(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder={`${sym}0.00`} placeholderTextColor={F.ink3}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 24, color: F.ink, marginBottom: 14 }}/>
      )}

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

      {useItems && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>ITEMS</Text>
          <ItemRows rows={rows} onChange={setRows} F={F} sym={sym}/>
        </View>
      )}

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>PAYMENT</Text>
      <View style={{ marginBottom: 14 }}>
        <PaymentPicker value={paymentMethod} onChange={setPaymentMethod} F={F}/>
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>MOOD</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: F.line, marginBottom: 14 }}>
        <MoodPicker
          selected={moodOn}
          value={moodIdx}
          onChange={(i) => { setMoodIdx(i); setMoodOn(true); }}
          onClear={moodOn ? () => setMoodOn(false) : undefined}
          F={F}/>
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

      <TouchableOpacity onPress={save} disabled={saving}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center', opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{saving ? 'Saving…' : 'Save changes'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default React.memo(EditExpense);
