import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { CURRENCIES } from '../data/constants';

const CAT_PRESETS = [
  { label: 'Stay',       emoji: '🏨' },
  { label: 'Food',       emoji: '🍱' },
  { label: 'Activities', emoji: '🎌' },
  { label: 'Transit',    emoji: '🚄' },
  { label: 'Shopping',   emoji: '🛍️' },
  { label: 'Other',      emoji: '🧳' },
];

export default function EditTrip({ route, navigation }) {
  const { F, sym, trips, addTrip, updateTrip, removeTrip, settings } = useApp();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;
  const editing = id ? trips.find(t => t.id === id) : null;

  const [name, setName]                 = useState(editing?.name || '');
  const [destination, setDestination]   = useState(editing?.destination || '');
  const [startDate, setStartDate]       = useState(editing?.start_date || '');
  const [endDate, setEndDate]           = useState(editing?.end_date || '');
  const [budget, setBudget]             = useState(editing ? String(editing.budget) : '');
  const [homeCur, setHomeCur]           = useState(editing?.home_currency || settings.currency);
  const [destCur, setDestCur]           = useState(editing?.dest_currency || 'USD');
  const [destRate, setDestRate]         = useState(editing ? String(editing.dest_rate) : '1');
  const [notes, setNotes]               = useState(editing?.notes || '');
  const [cats, setCats]                 = useState(editing?.categories?.map(c => ({ ...c })) || []);

  const homeSym = CURRENCIES[homeCur]?.symbol || sym;

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name your trip');
    const b = parseFloat(budget) || 0;
    const rate = parseFloat(destRate) || 1;
    const payload = {
      name: name.trim(),
      destination: destination.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      budget: b,
      home_currency: homeCur,
      dest_currency: destCur,
      dest_rate: rate,
      notes: notes.trim() || null,
      categories: cats.filter(c => c.label?.trim()).map(c => ({
        label: c.label.trim(),
        emoji: c.emoji || '🧳',
        amount: parseFloat(c.amount) || 0,
      })),
    };
    try {
      if (editing) await updateTrip(editing.id, payload);
      else await addTrip(payload);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Save failed', err.message || String(err));
    }
  };

  const handleDelete = () => {
    Alert.alert(`Delete ${name}?`, null, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await removeTrip(editing.id);
        navigation.goBack();
      } },
    ]);
  };

  const addCat = (preset) => {
    setCats(c => [...c, { ...preset, amount: '0' }]);
  };

  const updateCat = (i, patch) => {
    setCats(prev => {
      const next = prev.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <Field F={F} label="TRIP NAME">
        <TextInput value={name} onChangeText={setName}
          placeholder="e.g. Tokyo summer" placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={inputStyle(F, 16)}/>
      </Field>

      <Field F={F} label="DESTINATION (optional)">
        <TextInput value={destination} onChangeText={setDestination}
          placeholder="e.g. Tokyo & Kyoto" placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={inputStyle(F, 15)}/>
      </Field>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field F={F} label="START DATE">
            <TextInput value={startDate} onChangeText={setStartDate}
              placeholder="YYYY-MM-DD" placeholderTextColor={F.ink3}
              style={inputStyle(F, 14)}/>
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field F={F} label="END DATE">
            <TextInput value={endDate} onChangeText={setEndDate}
              placeholder="YYYY-MM-DD" placeholderTextColor={F.ink3}
              style={inputStyle(F, 14)}/>
          </Field>
        </View>
      </View>

      <Field F={F} label="BUDGET">
        <TextInput value={budget}
          onChangeText={t => setBudget(t.replace(/[^0-9.]/g, ''))}
          placeholder={`Total budget in ${homeCur}`}
          placeholderTextColor={F.ink3}
          keyboardType="decimal-pad"
          style={inputStyle(F, 20)}/>
      </Field>

      <Field F={F} label="HOME CURRENCY">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Object.keys(CURRENCIES).map(c => {
            const sel = c === homeCur;
            return (
              <TouchableOpacity key={c} onPress={() => setHomeCur(c)}
                style={chipStyle(F, sel)}>
                <Text style={{ color: sel ? '#fff' : F.ink, fontSize: 13, fontWeight: '600' }}>
                  {CURRENCIES[c].symbol} {c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="DESTINATION CURRENCY">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Object.keys(CURRENCIES).map(c => {
            const sel = c === destCur;
            return (
              <TouchableOpacity key={c} onPress={() => setDestCur(c)}
                style={chipStyle(F, sel)}>
                <Text style={{ color: sel ? '#fff' : F.ink, fontSize: 13, fontWeight: '600' }}>
                  {CURRENCIES[c].symbol} {c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label={`EXCHANGE RATE · 1 ${homeCur} = ? ${destCur}`}>
        <TextInput value={destRate}
          onChangeText={t => setDestRate(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          style={inputStyle(F, 16)}/>
      </Field>

      <Field F={F} label="NOTES (optional)">
        <TextInput value={notes} onChangeText={setNotes}
          placeholder="Anything to remember" placeholderTextColor={F.ink3}
          multiline
          style={[inputStyle(F, 14), { minHeight: 70, textAlignVertical: 'top' }]}/>
      </Field>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginTop: 8, marginBottom: 8 }}>
        BREAKDOWN
      </Text>
      {cats.map((c, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 24 }}>{c.emoji}</Text>
          <TextInput value={c.label} onChangeText={t => updateCat(i, { label: t })}
            placeholder="Label" placeholderTextColor={F.ink3}
            style={[inputStyle(F, 14), { flex: 2 }]}/>
          <TextInput value={String(c.amount)}
            onChangeText={t => updateCat(i, { amount: t.replace(/[^0-9.]/g, '') })}
            placeholder="0" placeholderTextColor={F.ink3}
            keyboardType="decimal-pad"
            style={[inputStyle(F, 14), { flex: 1 }]}/>
          <TouchableOpacity onPress={() => setCats(cs => cs.filter((_, k) => k !== i))}>
            <Text style={{ fontSize: 18, color: '#e55' }}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {CAT_PRESETS.map(p => (
          <TouchableOpacity key={p.label} onPress={() => addCat(p)}
            style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99,
              backgroundColor: F.cream, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 12, color: F.ink2 }}>+ {p.emoji} {p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={save}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {editing ? 'Save changes' : 'Create trip'}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={handleDelete}
          style={{ backgroundColor: '#fee2e2', padding: 16, borderRadius: 14, alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '700' }}>Delete trip</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function Field({ F, label, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function inputStyle(F, fontSize) {
  return {
    padding: 12, borderRadius: 12, borderWidth: 1, borderColor: F.line,
    backgroundColor: F.surface, fontSize, color: F.ink,
  };
}

function chipStyle(F, sel) {
  return {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
    backgroundColor: sel ? F.coral : F.surface,
    borderWidth: 1, borderColor: sel ? F.coral : F.line,
  };
}
