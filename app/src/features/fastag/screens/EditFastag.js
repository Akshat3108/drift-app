// PS-13 — Create / edit a FASTag account.

import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useFastag } from '@features/fastag/context';
import { useFuel } from '@features/fuel/context';
import { useSettings } from '@features/profile/settings.context';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const COLORS = ['#b09c8a', '#a3c7e9', '#6a8d73', '#e88373', '#fbbf24', '#888'];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Field({ F, label, sub, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </Text>
      {children}
      {!!sub && (
        <Text style={{ fontSize: 11, color: F.ink3, marginTop: 4 }}>{sub}</Text>
      )}
    </View>
  );
}

function NumericInput({ F, value, onChange, placeholder }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={F.ink3}
      keyboardType="decimal-pad"
      style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
        backgroundColor: F.surface, fontSize: 14, color: F.ink }}
    />
  );
}

function EditFastag({ route, navigation }) {
  const { F } = useTheme();
  const { accounts, addAccount, updateAccount, removeAccount, restoreAccount } = useFastag();
  const { vehicles } = useFuel();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const id = route?.params?.id;
  const editing = id ? accounts.find(a => a.id === id) : null;

  const [label,          setLabel]          = useState(editing?.label || '');
  const [vehicleId,      setVehicleId]      = useState(editing?.vehicle_id || null);
  const [tagId,          setTagId]          = useState(editing?.tag_id || '');
  const [bank,           setBank]           = useState(editing?.bank || '');
  const [balance,        setBalance]        = useState(editing ? String(editing.current_balance) : '');
  const [lastSynced,     setLastSynced]     = useState(editing?.last_synced || '');
  const [color,          setColor]          = useState(editing?.color || COLORS[0]);
  const [notes,          setNotes]          = useState(editing?.notes || '');
  const [saving,         setSaving]         = useState(false);

  const liveVehicles = (vehicles || []).filter(v => !v.deleted_at);

  const save = async () => {
    if (!label.trim()) return Alert.alert('Label required');
    const b = parseFloat(balance);
    if (balance.trim() && (!Number.isFinite(b) || b < 0)) {
      return Alert.alert('Balance must be a positive number');
    }
    if (lastSynced && !/^\d{4}-\d{2}-\d{2}$/.test(lastSynced)) {
      return Alert.alert('Last synced must be YYYY-MM-DD');
    }

    const payload = {
      vehicle_id: vehicleId || null,
      tag_id: tagId.trim() || null,
      bank: bank.trim() || null,
      label: label.trim(),
      current_balance: Number.isFinite(b) ? b : 0,
      last_synced: lastSynced.trim() || (balance.trim() ? todayIso() : null),
      notes: notes.trim() || null,
      icon: '🛣️',
      color,
    };

    setSaving(true);
    try {
      if (editing) await updateAccount(editing.id, payload);
      else         await addAccount(payload);
      navigation.goBack();
    } catch (err) {
      logError('editfastag:save', err);
      Alert.alert('Could not save', err?.message || String(err));
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert(
      `Delete ${editing.label}?`,
      'The FASTag goes away. Linked toll expenses keep existing but lose their tag link.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const lbl = editing.label;
          const eid = editing.id;
          try {
            await removeAccount(eid);
            navigation.goBack();
            toast(`Deleted: ${lbl}`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try { await restoreAccount(eid); }
                catch (err) {
                  logError('editfastag:undo-delete', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
          } catch (err) {
            logError('editfastag:delete', err);
            Alert.alert('Delete failed', err?.message || String(err));
          }
        }},
      ],
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <Field F={F} label="LABEL" sub="e.g. 'Honda City FASTag'">
        <TextInput value={label} onChangeText={setLabel}
          placeholder="FASTag label"
          placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="VEHICLE">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity onPress={() => setVehicleId(null)} activeOpacity={0.7}
            style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
              backgroundColor: vehicleId == null ? F.coral : F.surface,
              borderWidth: 1, borderColor: vehicleId == null ? F.coral : F.line }}>
            <Text style={{ fontSize: 12, color: vehicleId == null ? '#fff' : F.ink }}>None</Text>
          </TouchableOpacity>
          {liveVehicles.map((v) => {
            const sel = v.id === vehicleId;
            return (
              <TouchableOpacity key={v.id} onPress={() => setVehicleId(v.id)} activeOpacity={0.7}
                style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink }}>
                  {v.label || v.registration_number}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="BANK / ISSUER" sub="Optional — Paytm, ICICI, IDFC, HDFC, etc.">
        <TextInput value={bank} onChangeText={setBank}
          placeholder="Bank"
          placeholderTextColor={F.ink3}
          autoCapitalize="characters"
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="TAG ID" sub="Optional — printed on the FASTag sticker">
        <TextInput value={tagId} onChangeText={setTagId}
          placeholder="34161FA82..."
          placeholderTextColor={F.ink3}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="CURRENT BALANCE" sub={`Last known wallet balance in ${sym}`}>
        <NumericInput F={F} value={balance} onChange={setBalance} placeholder="0"/>
      </Field>

      <Field F={F} label="LAST SYNCED" sub="YYYY-MM-DD — leave blank to stamp today on save">
        <TextInput value={lastSynced} onChangeText={setLastSynced}
          placeholder={todayIso()}
          placeholderTextColor={F.ink3}
          autoCapitalize="none" autoCorrect={false}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="COLOUR">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {COLORS.map((c) => {
            const sel = c === color;
            return (
              <TouchableOpacity key={c} onPress={() => setColor(c)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ selected: sel }}
                style={{ width: 36, height: 36, borderRadius: 18,
                  backgroundColor: c,
                  borderWidth: sel ? 3 : 1, borderColor: sel ? F.coral : F.line }}/>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="NOTES">
        <TextInput value={notes} onChangeText={setNotes}
          placeholder="Optional" placeholderTextColor={F.ink3}
          multiline
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink, minHeight: 70,
            textAlignVertical: 'top' }}/>
      </Field>

      <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center',
          opacity: saving ? 0.6 : 1, marginBottom: editing ? 12 : 0 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add FASTag')}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={handleDelete} activeOpacity={0.7}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '600', fontSize: 13 }}>Delete FASTag</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditFastag);
