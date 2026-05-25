// 7.9 — EditPerson screen: minimal name + emoji + color + notes form.

import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { usePeople } from '@features/splits/context';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const EMOJIS = ['👤', '🧑', '👩', '👨', '🧑‍🤝‍🧑', '👯', '💼', '🏠', '🎓', '✈️'];
const COLORS = ['#888', '#7d6555', '#e88373', '#6a8d73', '#b09c8a', '#a3c7e9', '#d9272e', '#fbbf24'];

function EditPerson({ route, navigation }) {
  const { F } = useTheme();
  const { people, addPerson, updatePerson, removePerson, restorePerson } = usePeople();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const id = route?.params?.id;
  const editing = id ? people.find(p => p.id === id) : null;

  const [name, setName] = useState(editing?.name || '');
  const [emoji, setEmoji] = useState(editing?.emoji || EMOJIS[0]);
  const [color, setColor] = useState(editing?.color || COLORS[0]);
  const [notes, setNotes] = useState(editing?.notes || '');
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for this person.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updatePerson(editing.id, { name: name.trim(), emoji, color, notes: notes || null });
        toast(`Saved: ${name.trim()}`);
      } else {
        await addPerson({ name: name.trim(), emoji, color, notes: notes || null });
        toast(`Added: ${name.trim()}`);
      }
      navigation.goBack();
    } catch (err) {
      logError('people:save', err);
      Alert.alert('Save failed', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!editing) return;
    Alert.alert('Remove person?',
      `Remove ${editing.name}? Their splits stay on past expenses but won't show in balances.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await removePerson(editing.id);
            toast(`Removed: ${editing.name}`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try { await restorePerson(editing.id); }
                catch (err) {
                  logError('people:undo-delete', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
            navigation.goBack();
          } catch (err) {
            logError('people:delete', err);
            Alert.alert('Delete failed', err?.message || String(err));
          }
        }},
      ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 60, paddingHorizontal: 20 }}>

      <Text style={{ fontSize: 24, color: F.ink, marginBottom: 20 }}>
        {editing ? 'Edit person' : 'Add person'}
      </Text>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>NAME</Text>
      <TextInput
        value={name} onChangeText={setName}
        placeholder="e.g. Alice" placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink, marginBottom: 14 }}
      />

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>EMOJI</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {EMOJIS.map((e) => {
          const sel = e === emoji;
          return (
            <TouchableOpacity key={e} onPress={() => setEmoji(e)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Emoji ${e}`}
              accessibilityState={{ selected: sel }}
              style={{ width: 44, height: 44, borderRadius: 22,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
                alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>{e}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>COLOR</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {COLORS.map((c) => {
          const sel = c === color;
          return (
            <TouchableOpacity key={c} onPress={() => setColor(c)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Color ${c}`}
              accessibilityState={{ selected: sel }}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c,
                borderWidth: sel ? 3 : 1, borderColor: sel ? F.ink : F.line }}/>
          );
        })}
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>NOTES</Text>
      <TextInput
        value={notes} onChangeText={setNotes}
        placeholder="(optional)" placeholderTextColor={F.ink3} multiline
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink, minHeight: 60, marginBottom: 22 }}
      />

      <TouchableOpacity onPress={onSave} disabled={saving} activeOpacity={0.85}
        style={{ padding: 16, borderRadius: 14, backgroundColor: F.coral,
          alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          {editing ? 'Save changes' : 'Add person'}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={onDelete} activeOpacity={0.85}
          style={{ marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: F.surface,
            borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ color: F.coral, fontSize: 14, fontWeight: '500' }}>Remove person</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditPerson);
