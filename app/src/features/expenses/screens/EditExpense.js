import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useExpenses } from '@features/expenses/context';
import { useItemActions } from '@features/items/context';
import { useTags } from '@features/tags/context';
import TagChipSurface from '@features/tags/components/TagChipSurface';
import { usePeople } from '@features/splits/context';
import SplitChipSurface from '@features/splits/components/SplitChipSurface';
import { useEmi } from '@features/emi/context';
import { MoodPicker } from '@components/primitives/MoodPicker';
import PaymentPicker from '@components/primitives/PaymentPicker';
import ItemRows, { rowsFromExisting, toPersistedItems, rowsTotal } from '@components/ItemRows';

const MOODS = ['😍', '😌', '😐', '😬', '😞'];

function EditExpense({ route, navigation }) {
  const { F, sym, expenses, pots, updateExpense, updateExpenseWithItems } = useApp();
  const { tagsForExpense, splitsForExpense } = useExpenses();
  const { tags: allTags, getOrCreateTag } = useTags();
  const { people, getOrCreatePerson } = usePeople();
  const { loans: emiLoans } = useEmi();
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
  // 7.3 — load the current tag set for this expense and let the user edit
  // it. The expenses context's setForExpense diffs against the existing
  // set on save, so an unchanged selection is a no-op.
  const [tagNames, setTagNames]   = useState([]);
  const [showTagInput, setShowTagInput]     = useState(false);
  const [pendingTagName, setPendingTagName] = useState('');
  // 7.9 — splits set for this expense ({person_id, amount}[]). Loaded from
  // splitsForExpense on mount; passes through ExpensesProvider's diff-write.
  const [splits, setSplits] = useState([]);
  // 7.5 — optional EMI loan link. `emi_loan_id` is a real column on
  // expenses (v30) so it flows through update/updateWithItems patches.
  const [emiLoanId, setEmiLoanId] = useState(e?.emi_loan_id ?? null);

  useEffect(() => {
    if (!e?.id) return;
    listByExpense(e.id).then(list => {
      const existed = list.length > 0;
      setHadItems(existed);
      setUseItems(existed);
      setRows(existed ? rowsFromExisting(list) : []);
    }).catch(() => { setHadItems(false); setRows([]); });
  }, [e?.id, listByExpense]);

  useEffect(() => {
    if (!e?.id) return;
    tagsForExpense(e.id).then((list) => {
      setTagNames((list || []).map((t) => t.name));
    }).catch(() => { setTagNames([]); });
  }, [e?.id, tagsForExpense]);

  useEffect(() => {
    if (!e?.id) return;
    splitsForExpense(e.id).then((list) => {
      setSplits((list || []).map((r) => ({ person_id: r.person_id, amount: Number(r.amount) || 0 })));
    }).catch(() => { setSplits([]); });
  }, [e?.id, splitsForExpense]);

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
          tags: tagNames,
          splits,
          emi_loan_id: emiLoanId,
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
          tags: tagNames,
          splits,
          emi_loan_id: emiLoanId,
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
                hitSlop={{ top: 8, bottom: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Category: ${p.label}`}
                accessibilityState={{ selected: sel }}
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

      <TagChipSurface
        F={F}
        allTags={allTags}
        tagNames={tagNames}
        setTagNames={setTagNames}
        showTagInput={showTagInput}
        setShowTagInput={setShowTagInput}
        pendingTagName={pendingTagName}
        setPendingTagName={setPendingTagName}
        getOrCreateTag={getOrCreateTag}
        style={{ marginBottom: 14 }}
      />

      {/* 7.9 — Split surface. Pass expenseTotal so the Σ validation can render
          green at parity / red on overage. Both `useItems` and "amount" paths
          compute total live so users see the validation update immediately. */}
      <SplitChipSurface
        F={F}
        people={people}
        splits={splits}
        setSplits={setSplits}
        expenseTotal={useItems ? itemsSum : (parseFloat(amount) || 0)}
        getOrCreatePerson={getOrCreatePerson}
        sym={sym}
        style={{ marginBottom: 14 }}
      />

      {/* 7.5 — EMI link. Only rendered when at least one loan exists.
          Tap a chip to mark this expense as that loan's installment payment;
          tap again to clear. emi_loan_id is a real FK column (v30). */}
      {emiLoans.length > 0 && (
        <View style={{ backgroundColor: F.surface, borderRadius: 14, padding: 14,
          borderWidth: 1, borderColor: F.line, marginBottom: 14 }}>
          <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>
            EMI PAYMENT
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingRight: 4 }}>
            {emiLoans.map((loan) => {
              const sel = emiLoanId === loan.id;
              return (
                <TouchableOpacity
                  key={loan.id}
                  onPress={() => setEmiLoanId(sel ? null : loan.id)}
                  activeOpacity={0.75}
                  hitSlop={{ top: 6, bottom: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Link to EMI ${loan.name}`}
                  accessibilityState={{ selected: sel }}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99,
                    backgroundColor: sel ? F.coral : F.cream,
                    borderWidth: 1, borderColor: sel ? F.coral : F.line,
                  }}>
                  <Text style={{ color: sel ? '#fff' : F.ink, fontSize: 12,
                    fontWeight: sel ? '700' : '500' }}>
                    {loan.icon || '🏦'} {loan.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

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
