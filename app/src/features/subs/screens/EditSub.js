import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const ICONS = ['📺','🎧','📰','🏋','🎓','🧘','📚','☁️','🎮','📱','📦'];
const COLORS = ['#e50914','#1db954','#333','#222','#d9272e','#f47d31','#0ea5e9','#7c3aed','#10b981','#fbbf24','#888'];

function EditSub({ route, navigation }) {
  const { F, sym, subs, addSub, updateSub, removeSub, restoreSub } = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;
  const editing = id ? subs.find(s => s.id === id) : null;

  const [name, setName]       = useState(editing?.name || '');
  const [amount, setAmount]   = useState(editing ? String(editing.amount) : '');
  const [period, setPeriod]   = useState(editing?.period || 'mo');
  const [used, setUsed]       = useState(editing?.used_freq || '');
  const [verdict, setVerdict] = useState(editing?.verdict || 'keep');
  const [icon, setIcon]       = useState(editing?.icon || '📺');
  const [color, setColor]     = useState(editing?.color || '#888');

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name required');
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) return Alert.alert('Enter a valid amount');
    const payload = { name: name.trim(), amount: amt, period, used_freq: used || null, verdict, icon, color };
    if (editing) await updateSub(editing.id, payload);
    else         await addSub(payload);
    navigation.goBack();
  };

  const handleDelete = async () => {
    const label = name.trim() || 'subscription';
    const id = editing.id;
    try {
      await removeSub(id);
      navigation.goBack();
      toast(`Deleted: ${label}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreSub(id); }
          catch (err) {
            logError('editsub:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('editsub:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <Field F={F} label="NAME">
        <TextInput value={name} onChangeText={setName}
          placeholder="e.g. Netflix" placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={input(F, 16)}/>
      </Field>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 2 }}>
          <Field F={F} label="AMOUNT">
            <TextInput value={amount}
              onChangeText={t => setAmount(t.replace(/[^0-9.]/g, ''))}
              placeholder={`${sym}0.00`} placeholderTextColor={F.ink3}
              keyboardType="decimal-pad"
              style={input(F, 20)}/>
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field F={F} label="EVERY">
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {['mo', 'yr', 'wk'].map(p => {
                const sel = period === p;
                return (
                  <TouchableOpacity key={p} onPress={() => setPeriod(p)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                      backgroundColor: sel ? F.coral : F.surface,
                      borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                    <Text style={{ color: sel ? '#fff' : F.ink, fontSize: 13, fontWeight: '600' }}>{p}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>
        </View>
      </View>

      <Field F={F} label="USED FREQUENCY (optional)">
        <TextInput value={used} onChangeText={setUsed}
          placeholder="e.g. Daily, 2× last mo, never"
          placeholderTextColor={F.ink3}
          style={input(F, 14)}/>
      </Field>

      <Field F={F} label="VERDICT">
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {['keep', 'review', 'cancel'].map(v => {
            const sel = verdict === v;
            const bg = sel
              ? (v === 'cancel' ? F.coral : v === 'review' ? F.warn : F.sageD)
              : F.surface;
            return (
              <TouchableOpacity key={v} onPress={() => setVerdict(v)}
                style={{ flex: 1, padding: 12, borderRadius: 10, alignItems: 'center',
                  backgroundColor: bg, borderWidth: 1, borderColor: sel ? bg : F.line }}>
                <Text style={{ color: sel ? '#fff' : F.ink, fontSize: 13, fontWeight: '600' }}>{v}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="ICON">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ICONS.map(e => (
            <TouchableOpacity key={e} onPress={() => setIcon(e)}
              style={{ width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                backgroundColor: icon === e ? F.cream : F.surface,
                borderWidth: 2, borderColor: icon === e ? F.coral : F.line }}>
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>

      <Field F={F} label="ICON COLOUR">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {COLORS.map(c => (
            <TouchableOpacity key={c} onPress={() => setColor(c)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c,
                borderWidth: color === c ? 3 : 1, borderColor: color === c ? F.coral : F.line }}/>
          ))}
        </View>
      </Field>

      <TouchableOpacity onPress={save}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12, marginTop: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {editing ? 'Save changes' : 'Add subscription'}
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

function input(F, fontSize) {
  return {
    padding: 12, borderRadius: 12, borderWidth: 1, borderColor: F.line,
    backgroundColor: F.surface, fontSize, color: F.ink,
  };
}

export default React.memo(EditSub);
