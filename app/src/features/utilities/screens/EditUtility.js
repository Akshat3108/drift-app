// 7.12 — EditUtility screen.
//
// Minimal form: name, kind enum, provider, account number, billing day,
// icon picker, color picker, notes.

import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useUtilities } from '@features/utilities/context';
import { defaultIconForKind } from '@features/utilities/repo';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const KINDS = [
  { key: 'electricity', label: 'Electricity', icon: '⚡' },
  { key: 'gas',         label: 'Gas',         icon: '🔥' },
  { key: 'water',       label: 'Water',       icon: '💧' },
  { key: 'internet',    label: 'Internet',    icon: '📡' },
  { key: 'mobile',      label: 'Mobile',      icon: '📱' },
  { key: 'dth',         label: 'DTH/TV',      icon: '📺' },
  { key: 'other',       label: 'Other',       icon: '💡' },
];

const ICONS  = ['⚡', '🔥', '💧', '📡', '📱', '📺', '💡', '🏠'];
const COLORS = ['#888', '#7d6555', '#e88373', '#6a8d73', '#b09c8a', '#a3c7e9', '#fbbf24', '#d9272e'];

function EditUtility({ route, navigation }) {
  const { F } = useTheme();
  const { accounts, addAccount, updateAccount, removeAccount, restoreAccount } = useUtilities();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const id = route?.params?.id;
  const editing = id ? accounts.find(a => a.id === id) : null;

  const [name, setName]                   = useState(editing?.name || '');
  const [kind, setKind]                   = useState(editing?.kind || 'electricity');
  const [provider, setProvider]           = useState(editing?.provider || '');
  const [accountNumber, setAccountNumber] = useState(editing?.account_number || '');
  const [icon, setIcon]                   = useState(editing?.icon || defaultIconForKind('electricity'));
  const [color, setColor]                 = useState(editing?.color || COLORS[0]);
  const [billingDay, setBillingDay]       = useState(editing?.billing_day != null ? String(editing.billing_day) : '');
  const [notes, setNotes]                 = useState(editing?.notes || '');
  const [saving, setSaving]               = useState(false);

  async function onSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for this utility account.');
      return;
    }
    let bd = null;
    if (billingDay.trim()) {
      const n = parseInt(billingDay, 10);
      if (!Number.isInteger(n) || n < 1 || n > 28) {
        Alert.alert('Billing day must be 1-28', 'Or leave blank.');
        return;
      }
      bd = n;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        kind,
        provider: provider.trim() || null,
        account_number: accountNumber.trim() || null,
        icon, color,
        billing_day: bd,
        notes: notes.trim() || null,
      };
      if (editing) { await updateAccount(editing.id, payload); toast(`Saved: ${name.trim()}`); }
      else { await addAccount(payload); toast(`Added: ${name.trim()}`); }
      navigation.goBack();
    } catch (err) {
      logError('utilities:save', err);
      Alert.alert('Save failed', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!editing) return;
    Alert.alert('Remove utility?',
      `Remove ${editing.name}? Past bills stay logged as expenses.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await removeAccount(editing.id);
            toast(`Removed: ${editing.name}`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try { await restoreAccount(editing.id); }
                catch (err) {
                  logError('utilities:undo-delete', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
            navigation.goBack();
          } catch (err) {
            logError('utilities:delete', err);
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
        {editing ? 'Edit utility' : 'Add utility'}
      </Text>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>NAME</Text>
      <TextInput value={name} onChangeText={setName}
        placeholder="e.g. Home electricity" placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>KIND</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {KINDS.map((k) => {
          const sel = kind === k.key;
          return (
            <TouchableOpacity key={k.key}
              onPress={() => {
                setKind(k.key);
                if (!editing) setIcon(k.icon);
              }}
              activeOpacity={0.85}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`Kind ${k.label}`}
              accessibilityState={{ selected: sel }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
                backgroundColor: sel ? F.coral : F.cream,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
              }}>
              <Text style={{ fontSize: 14 }}>{k.icon}</Text>
              <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink }}>{k.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>PROVIDER</Text>
      <TextInput value={provider} onChangeText={setProvider}
        placeholder="e.g. BSES / Tata Power / Airtel" placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>ACCOUNT / CONNECTION NUMBER</Text>
      <TextInput value={accountNumber} onChangeText={setAccountNumber}
        placeholder="(optional)" placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>BILLING DAY (1-28)</Text>
      <TextInput value={billingDay} onChangeText={(t) => setBillingDay(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder="(optional)" placeholderTextColor={F.ink3}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink, marginBottom: 14 }}/>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>ICON</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {ICONS.map((i) => {
          const sel = i === icon;
          return (
            <TouchableOpacity key={i} onPress={() => setIcon(i)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              style={{ width: 44, height: 44, borderRadius: 13,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
                alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>{i}</Text>
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
              accessibilityState={{ selected: sel }}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c,
                borderWidth: sel ? 3 : 1, borderColor: sel ? F.ink : F.line }}/>
          );
        })}
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>NOTES</Text>
      <TextInput value={notes} onChangeText={setNotes}
        placeholder="(optional)" placeholderTextColor={F.ink3} multiline
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink, minHeight: 60, marginBottom: 22 }}/>

      <TouchableOpacity onPress={onSave} disabled={saving} activeOpacity={0.85}
        style={{ padding: 16, borderRadius: 14, backgroundColor: F.coral,
          alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          {editing ? 'Save changes' : 'Add utility'}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={onDelete} activeOpacity={0.85}
          style={{ marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: F.surface,
            borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ color: F.coral, fontSize: 14, fontWeight: '500' }}>Remove utility</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditUtility);
