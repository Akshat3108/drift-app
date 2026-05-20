import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const EMOJIS = ['✈️','🛟','💻','🏠','🎓','🚗','💍','📚','🧘','💎','🎁','🌴'];

function EditGoal({ route, navigation }) {
  const { F, sym, goals, addGoal, updateGoal, removeGoal, restoreGoal } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;
  const editing = id ? goals.find(g => g.id === id) : null;

  const [name, setName]     = useState(editing?.name || '');
  const [emoji, setEmoji]   = useState(editing?.emoji || '🎯');
  const [target, setTarget] = useState(editing ? String(editing.target_amount) : '');
  const [saved, setSaved]   = useState(editing ? String(editing.saved_amount) : '');
  const [eta, setEta]       = useState(editing?.eta || '');

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name required');
    const tgt = parseFloat(target);
    const sav = parseFloat(saved) || 0;
    if (!isFinite(tgt) || tgt <= 0) return Alert.alert('Enter a target amount');
    const payload = { name: name.trim(), emoji, target_amount: tgt, saved_amount: sav, eta: eta || null };
    if (editing) await updateGoal(editing.id, payload);
    else         await addGoal(payload);
    navigation.goBack();
  };

  const handleDelete = async () => {
    const label = name.trim() || 'goal';
    const id = editing.id;
    try {
      await removeGoal(id);
      navigation.goBack();
      toast(`Deleted: ${label}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreGoal(id); }
          catch (err) {
            logError('editgoal:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('editgoal:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>EMOJI</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {EMOJIS.map(e => (
          <TouchableOpacity key={e} onPress={() => setEmoji(e)}
            style={{ width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
              backgroundColor: emoji === e ? F.cream : F.surface,
              borderWidth: 2, borderColor: emoji === e ? F.coral : F.line }}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>NAME</Text>
      <TextInput value={name} onChangeText={setName}
        placeholder="e.g. Japan trip" placeholderTextColor={F.ink3}
        autoCapitalize="words"
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>TARGET</Text>
      <TextInput value={target}
        onChangeText={t => setTarget(t.replace(/[^0-9.]/g, ''))}
        placeholder={`${sym}0.00`} placeholderTextColor={F.ink3}
        keyboardType="decimal-pad"
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 22, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>SAVED SO FAR</Text>
      <TextInput value={saved}
        onChangeText={t => setSaved(t.replace(/[^0-9.]/g, ''))}
        placeholder={`${sym}0`} placeholderTextColor={F.ink3}
        keyboardType="decimal-pad"
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 18, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>ETA (optional)</Text>
      <TextInput value={eta} onChangeText={setEta}
        placeholder="e.g. Aug 2026 or 2026-08" placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink, marginBottom: 24 }}/>

      <TouchableOpacity onPress={save}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {editing ? 'Save changes' : 'Create goal'}
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

export default React.memo(EditGoal);
