import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { MoodPicker } from '../components/UI';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
const MOODS = ['😍', '😌', '😐', '😬', '😞'];

export default function Add({ navigation }) {
  const { F, sym, pots, addExpense, settings } = useApp();
  const insets = useSafeAreaInsets();
  const [amount, setAmount]     = useState('0.00');
  const [merchant, setMerchant] = useState('');
  const [potId, setPotId]       = useState(pots[0]?.id || null);
  const [mood, setMood]         = useState(1);
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving]     = useState(false);

  const press = (key) => {
    setAmount(prev => {
      if (key === '⌫') {
        const s = prev.replace('.', '').slice(0, -1) || '0';
        const p = s.padStart(3, '0');
        return `${parseInt(p.slice(0, -2), 10)}.${p.slice(-2)}`;
      }
      if (key === '.') return prev.includes('.') ? prev : prev + '.';
      const s = prev.replace('.', '') + key;
      const p = s.padStart(3, '0');
      return `${parseInt(p.slice(0, -2), 10)}.${p.slice(-2)}`;
    });
  };

  const selected = pots.find(p => p.id === potId);

  const save = async () => {
    if (parseFloat(amount) === 0) return Alert.alert('Enter an amount');
    if (!merchant.trim()) return Alert.alert('Enter a merchant name');
    if (!selected) return Alert.alert('Pick a category');
    setSaving(true);
    try {
      await addExpense({
        category_id: selected.id,
        merchant: merchant.trim(),
        amount: parseFloat(amount),
        mood: MOODS[mood],
        carbon: settings.carbon_tracking ? 0.4 : 0,
        recurring,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save', err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  if (pots.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, padding: 24,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🍃</Text>
        <Text style={{ fontSize: 16, color: F.ink, fontWeight: '500' }}>No categories yet</Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginTop: 8, textAlign: 'center' }}>
          Add a category from Profile → Manage categories before logging spends.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 24, backgroundColor: F.coral, borderRadius: 12,
            paddingVertical: 12, paddingHorizontal: 32 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>OK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center', backgroundColor: F.surface,
        borderBottomWidth: 1, borderBottomColor: F.line }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: F.ink2, fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, color: F.ink, fontWeight: '400' }}>Add a spend</Text>
        <TouchableOpacity onPress={save} disabled={saving}>
          <Text style={{ color: F.coral, fontSize: 16, fontWeight: '700', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
        <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 24, marginTop: 16,
          alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: F.ink2 }}>I spent</Text>
          <Text style={{ fontSize: 56, color: F.ink, fontWeight: '400', marginTop: 4 }}>
            {sym}{amount.split('.')[0]}
            <Text style={{ fontSize: 30, color: F.ink3 }}>.{(amount.split('.')[1] || '00').slice(0, 2)}</Text>
          </Text>
          <TextInput value={merchant} onChangeText={setMerchant}
            placeholder="Merchant name" placeholderTextColor={F.ink3}
            style={{ marginTop: 12, borderBottomWidth: 1, borderBottomColor: F.ink3,
              textAlign: 'center', fontSize: 15, color: F.ink, paddingBottom: 4, width: '80%' }}/>
        </View>

        <Text style={{ fontSize: 15, color: F.ink, marginTop: 20, marginBottom: 10 }}>What kind?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
            {pots.map(p => {
              const sel = potId === p.id;
              return (
                <TouchableOpacity key={p.id} onPress={() => setPotId(p.id)}
                  style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99,
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

        <Text style={{ fontSize: 15, color: F.ink, marginTop: 20, marginBottom: 10 }}>How did it feel?</Text>
        <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 16,
          borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
          <MoodPicker value={mood} onChange={setMood} F={F}/>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
          {settings.carbon_tracking ? (
            <View style={{ flex: 1, backgroundColor: F.mint, borderRadius: 18, padding: 14 }}>
              <Text style={{ fontSize: 11, color: F.ink2 }}>🌱 Carbon</Text>
              <Text style={{ fontSize: 20, color: F.sageD, marginTop: 6 }}>0.4 kg</Text>
              <Text style={{ fontSize: 10, color: F.ink3 }}>low impact ✿</Text>
            </View>
          ) : <View style={{ flex: 1 }}/>}
          <TouchableOpacity onPress={() => setRecurring(!recurring)}
            style={{ flex: 1, backgroundColor: recurring ? F.lilac : F.sky, borderRadius: 18, padding: 14 }}>
            <Text style={{ fontSize: 11, color: F.ink2 }}>🔄 Repeat?</Text>
            <Text style={{ fontSize: 14, color: F.ink, marginTop: 6, fontWeight: '500' }}>
              {recurring ? 'Every month' : 'Just once'}
            </Text>
            <Text style={{ fontSize: 10, color: F.ink3 }}>tap to toggle</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={{ backgroundColor: F.surface, borderTopWidth: 1, borderTopColor: F.line,
        paddingHorizontal: 12, paddingTop: 12, paddingBottom: insets.bottom + 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {KEYS.map(k => (
            <TouchableOpacity key={k} onPress={() => press(k)} activeOpacity={0.7}
              style={{ width: '33.33%', paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: k === '⌫' ? 20 : 24, color: F.ink, fontWeight: '400' }}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
