import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { splitEqually } from '@features/splits/repo';

// 7.9 — Per-expense split selection surface used inside EditExpense.
//
// State protocol: caller owns `splits` (array of {person_id, amount}) and
// passes `setSplits`. The surface renders:
//   - chip strip of all people; tap to toggle inclusion
//   - per-selected-person row: emoji + name + amount input
//   - actions row: "Split equally" + "Clear all" + live "Σ = X / total" pill
//
// Validation: the parent computes the expense total and passes it via
// `expenseTotal` so the Σ pill renders red when over and green at parity.

const MAX_NAME_LEN = 24;

function fmt(sym, n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${sym}${v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function SplitChipSurface({
  F,
  people = [],
  splits = [],
  setSplits,
  expenseTotal = 0,
  getOrCreatePerson,
  sym = '₹',
  style,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [pendingName, setPendingName] = useState('');

  const selectedSet = useMemo(
    () => new Set((splits || []).map((s) => s.person_id)),
    [splits],
  );
  const peopleById = useMemo(
    () => new Map((people || []).map((p) => [p.id, p])),
    [people],
  );

  const totalSplit = useMemo(
    () => (splits || []).reduce((s, x) => s + (Number(x.amount) || 0), 0),
    [splits],
  );
  const overTotal = expenseTotal > 0 && totalSplit > expenseTotal + 0.005;
  const balanced  = expenseTotal > 0 && Math.abs(totalSplit - expenseTotal) <= 0.01;

  const togglePerson = (pid) => {
    setSplits((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : [];
      const idx = arr.findIndex((s) => s.person_id === pid);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push({ person_id: pid, amount: 0 });
      return arr;
    });
  };

  const setAmount = (pid, raw) => {
    setSplits((prev) => {
      const arr = Array.isArray(prev) ? prev.slice() : [];
      const idx = arr.findIndex((s) => s.person_id === pid);
      const amt = Number(raw) || 0;
      if (idx < 0) {
        if (amt > 0) arr.push({ person_id: pid, amount: amt });
      } else {
        arr[idx] = { ...arr[idx], amount: amt };
      }
      return arr;
    });
  };

  const splitEquallyAcross = () => {
    if (!(expenseTotal > 0)) {
      Alert.alert('No total yet', 'Enter the expense amount first.');
      return;
    }
    if (!splits.length) return;
    const shares = splitEqually(expenseTotal, splits.length);
    setSplits((prev) => prev.map((s, i) => ({ ...s, amount: shares[i] })));
  };

  const clearAll = () => setSplits([]);

  const commitNewPerson = async () => {
    const raw = (pendingName || '').trim();
    if (!raw) { setShowAdd(false); return; }
    if (raw.length > MAX_NAME_LEN) {
      Alert.alert('Name too long', `Keep names under ${MAX_NAME_LEN} characters.`);
      return;
    }
    try {
      const person = await getOrCreatePerson({ name: raw });
      if (person && !selectedSet.has(person.id)) {
        setSplits((prev) => [...(Array.isArray(prev) ? prev : []), { person_id: person.id, amount: 0 }]);
      }
    } catch (err) {
      Alert.alert('Could not add person', err?.message || String(err));
    } finally {
      setPendingName('');
      setShowAdd(false);
    }
  };

  return (
    <View style={[{ backgroundColor: F.surface, borderRadius: 18, padding: 14,
      borderWidth: 1, borderColor: F.line }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, flex: 1 }}>
          SPLIT WITH
        </Text>
        {!showAdd && (
          <TouchableOpacity onPress={() => setShowAdd(true)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Add new person inline">
            <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {showAdd && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <TextInput
            value={pendingName}
            onChangeText={setPendingName}
            placeholder="e.g. Bob"
            placeholderTextColor={F.ink3}
            autoCapitalize="words"
            maxLength={MAX_NAME_LEN}
            onSubmitEditing={commitNewPerson}
            returnKeyType="done"
            style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: F.line,
              backgroundColor: F.bg, fontSize: 13, color: F.ink }}/>
          <TouchableOpacity onPress={commitNewPerson}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10,
              backgroundColor: F.coral }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowAdd(false); setPendingName(''); }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ paddingHorizontal: 10, justifyContent: 'center' }}>
            <Text style={{ color: F.ink3, fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {people.length === 0 && !showAdd && (
        <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 6 }}>
          No people yet. Add one with "+ Add" or from the People screen.
        </Text>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 4 }}>
        {people.map((p) => {
          const selected = selectedSet.has(p.id);
          return (
            <TouchableOpacity key={p.id}
              onPress={() => togglePerson(p.id)}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${p.name} from split`}
              accessibilityState={{ selected }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 8,
                borderRadius: 18, marginRight: 8,
                backgroundColor: selected ? F.coral : F.cream,
                borderWidth: 1, borderColor: selected ? F.coral : F.line,
              }}>
              <Text style={{ fontSize: 14 }}>{p.emoji || '👤'}</Text>
              <Text style={{ fontSize: 13, color: selected ? '#fff' : F.ink, fontWeight: '500' }}>
                {p.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {splits.length > 0 && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {splits.map((s) => {
            const p = peopleById.get(s.person_id);
            if (!p) return null;
            return (
              <View key={s.person_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 16 }}>{p.emoji || '👤'}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: F.ink }}>{p.name}</Text>
                <Text style={{ fontSize: 12, color: F.ink3 }}>{sym}</Text>
                <TextInput
                  value={s.amount ? String(s.amount) : ''}
                  onChangeText={(t) => setAmount(s.person_id, t)}
                  placeholder="0"
                  placeholderTextColor={F.ink3}
                  keyboardType="decimal-pad"
                  style={{ width: 90, padding: 8, borderRadius: 8, borderWidth: 1,
                    borderColor: F.line, backgroundColor: F.bg,
                    fontSize: 14, color: F.ink, textAlign: 'right' }}/>
              </View>
            );
          })}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity onPress={splitEquallyAcross}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Split equally"
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                backgroundColor: F.cream, borderWidth: 1, borderColor: F.line }}>
              <Text style={{ fontSize: 12, color: F.ink, fontWeight: '500' }}>Split equally</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearAll}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Clear all splits"
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                backgroundColor: F.surface, borderWidth: 1, borderColor: F.line }}>
              <Text style={{ fontSize: 12, color: F.ink2 }}>Clear all</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}/>
            <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
              backgroundColor: overTotal ? F.coral
                : balanced ? F.sage
                : F.cream,
              borderWidth: 1,
              borderColor: overTotal ? F.coral : balanced ? F.sage : F.line }}>
              <Text style={{ fontSize: 11, color: (overTotal || balanced) ? '#fff' : F.ink, fontWeight: '600' }}>
                Σ {fmt(sym, totalSplit)}
                {expenseTotal > 0 && (
                  <Text style={{ color: (overTotal || balanced) ? '#fff' : F.ink3 }}> / {fmt(sym, expenseTotal)}</Text>
                )}
              </Text>
            </View>
          </View>
          {overTotal && (
            <Text style={{ fontSize: 11, color: F.coral, marginTop: 2 }}>
              Splits exceed the expense total.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
