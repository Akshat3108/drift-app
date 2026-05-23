// 7.6 — EditVehicle screen: create or edit a vehicle.
//
// Form fields: name, type (chip group), fuel_type (chip group), registration
// number, icon + colour pickers, notes. Delete button at the bottom when
// editing.

import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useFuel } from '@features/fuel/context';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const TYPES      = ['car', 'bike', 'scooter', 'other'];
const FUEL_TYPES = ['Petrol', 'Diesel', 'CNG', 'Electric'];
const ICONS      = ['🚗', '🏍️', '🛵', '🚙', '🚐', '🚜', '🚛', '🚕'];
const COLORS     = ['#888', '#7d6555', '#e88373', '#6a8d73', '#b09c8a', '#a3c7e9', '#d9272e', '#fbbf24'];

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

function Chips({ F, options, value, onChange, capitalise }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const sel = opt === value;
        const label = capitalise ? opt[0].toUpperCase() + opt.slice(1) : opt;
        return (
          <TouchableOpacity key={opt} onPress={() => onChange(opt)} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel={label}
            accessibilityState={{ selected: sel }}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
              backgroundColor: sel ? F.coral : F.surface,
              borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
            <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink, fontWeight: '600' }}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function EditVehicle({ route, navigation }) {
  const { F } = useTheme();
  const { vehicles, addVehicle, updateVehicle, removeVehicle, restoreVehicle } = useFuel();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const id = route?.params?.id;
  const editing = id ? vehicles.find(v => v.id === id) : null;

  const [name,     setName]     = useState(editing?.name || '');
  const [type,     setType]     = useState(editing?.type || 'car');
  const [fuelType, setFuelType] = useState(editing?.fuel_type || 'Petrol');
  const [reg,      setReg]      = useState(editing?.registration_number || '');
  const [icon,     setIcon]     = useState(editing?.icon || ICONS[0]);
  const [color,    setColor]    = useState(editing?.color || COLORS[0]);
  const [notes,    setNotes]    = useState(editing?.notes || '');
  const [saving,   setSaving]   = useState(false);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name required');
    const payload = {
      name: name.trim(),
      type,
      fuel_type: fuelType,
      registration_number: reg.trim() || null,
      notes: notes.trim() || null,
      icon,
      color,
    };
    setSaving(true);
    try {
      if (editing) await updateVehicle(editing.id, payload);
      else         await addVehicle(payload);
      navigation.goBack();
    } catch (err) {
      logError('editvehicle:save', err);
      Alert.alert('Could not save', err?.message || String(err));
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert(
      `Delete ${editing.name}?`,
      'The vehicle goes away. Fill-up history stays hidden until you restore it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const label = editing.name;
          const vid = editing.id;
          try {
            await removeVehicle(vid);
            navigation.goBack();
            toast(`Deleted: ${label}`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try { await restoreVehicle(vid); }
                catch (err) {
                  logError('editvehicle:undo-delete', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
          } catch (err) {
            logError('editvehicle:delete', err);
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

      <Field F={F} label="NAME">
        <TextInput value={name} onChangeText={setName}
          placeholder="Black Polo"
          placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="TYPE">
        <Chips F={F} options={TYPES} value={type} onChange={setType} capitalise/>
      </Field>

      <Field F={F} label="FUEL TYPE" sub="Default for fill-ups on this vehicle">
        <Chips F={F} options={FUEL_TYPES} value={fuelType} onChange={setFuelType}/>
      </Field>

      <Field F={F} label="REGISTRATION NUMBER" sub="Optional">
        <TextInput value={reg} onChangeText={setReg}
          placeholder="DL 1A 1234"
          placeholderTextColor={F.ink3}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="ICON">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ICONS.map((g) => {
            const sel = g === icon;
            return (
              <TouchableOpacity key={g} onPress={() => setIcon(g)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`Icon ${g}`}
                accessibilityState={{ selected: sel }}
                style={{ width: 44, height: 44, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line,
                  alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{g}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
          {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add vehicle')}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={handleDelete} activeOpacity={0.7}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '600', fontSize: 13 }}>Delete vehicle</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditVehicle);
