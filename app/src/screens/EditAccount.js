import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';

const EMOJIS_ASSET = ['🏦', '💰', '📈', '🏠', '💵', '₿', '💎', '🚗'];
const EMOJIS_LIAB  = ['💳', '🎓', '🏠', '🚗', '🩺', '📚'];
const CATEGORIES_ASSET = ['Cash', 'Savings', 'Investments', 'Property', 'Vehicle', 'Other'];
const CATEGORIES_LIAB  = ['Credit card', 'Student loan', 'Mortgage', 'Car loan', 'Personal loan', 'Other'];

export default function EditAccount({ route, navigation }) {
  const { F, sym, accounts, addAccount, updateAccount, removeAccount } = useApp();
  const insets = useSafeAreaInsets();
  const id      = route.params?.id;
  const initKind = route.params?.kind || 'asset';
  const editing = id ? accounts.find(a => a.id === id) : null;

  const [kind, setKind]         = useState(editing?.kind || initKind);
  const [label, setLabel]       = useState(editing?.label || '');
  const [emoji, setEmoji]       = useState(editing?.emoji || (kind === 'asset' ? '🏦' : '💳'));
  const [balance, setBalance]   = useState(editing ? String(editing.balance) : '');
  const [category, setCategory] = useState(editing?.category || '');

  const EMOJIS = kind === 'asset' ? EMOJIS_ASSET : EMOJIS_LIAB;
  const CATS   = kind === 'asset' ? CATEGORIES_ASSET : CATEGORIES_LIAB;

  const save = async () => {
    if (!label.trim()) return Alert.alert('Name required');
    const bal = parseFloat(balance);
    if (!isFinite(bal) || bal < 0) return Alert.alert('Enter a valid balance');
    try {
      if (editing) {
        await updateAccount(editing.id, { kind, label: label.trim(), emoji, balance: bal, category: category || null });
      } else {
        await addAccount({ kind, label: label.trim(), emoji, balance: bal, category: category || null });
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Save failed', err.message || String(err));
    }
  };

  const handleDelete = () => {
    Alert.alert(`Delete ${label}?`, null, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await removeAccount(editing.id);
        navigation.goBack();
      } },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>TYPE</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {['asset', 'liability'].map(k => {
          const sel = kind === k;
          return (
            <TouchableOpacity key={k} onPress={() => setKind(k)} disabled={!!editing}
              style={{ flex: 1, padding: 14, borderRadius: 14,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
                alignItems: 'center', opacity: editing ? 0.6 : 1 }}>
              <Text style={{ color: sel ? '#fff' : F.ink, fontWeight: '600', textTransform: 'capitalize' }}>{k}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>NAME</Text>
      <TextInput value={label} onChangeText={setLabel}
        placeholder="e.g. HDFC Savings" placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 16 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>BALANCE</Text>
      <TextInput value={balance} onChangeText={t => setBalance(t.replace(/[^0-9.]/g, ''))}
        placeholder={`Amount (${sym})`} placeholderTextColor={F.ink3}
        keyboardType="decimal-pad"
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 22, color: F.ink, marginBottom: 16 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>EMOJI</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {EMOJIS.map(e => (
          <TouchableOpacity key={e} onPress={() => setEmoji(e)}
            style={{ width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: emoji === e ? F.cream : F.surface,
              borderWidth: 2, borderColor: emoji === e ? F.coral : F.line }}>
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>CATEGORY (optional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
        {CATS.map(c => {
          const sel = category === c;
          return (
            <TouchableOpacity key={c} onPress={() => setCategory(sel ? '' : c)}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
              <Text style={{ color: sel ? '#fff' : F.ink2, fontSize: 12, fontWeight: '600' }}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity onPress={save}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {editing ? 'Save changes' : 'Add account'}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={handleDelete}
          style={{ backgroundColor: '#fee2e2', padding: 16, borderRadius: 14, alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '700' }}>Delete</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
