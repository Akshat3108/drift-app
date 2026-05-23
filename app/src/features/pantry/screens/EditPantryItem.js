// 7.7 — EditPantryItem: create / edit a pantry inventory row.
//
// Create flow: optionally pick an existing item_summary candidate (top
// frequent items the user has bought but isn't tracking yet) OR type a new
// item from scratch. Edit flow: fields hydrate from the existing row, no
// picker (normalized_name + canonical_unit are stable post-creation).

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { usePantry } from '@features/pantry/context';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';
import { normalizeName } from '@core/domain/normalize';

const UNITS = ['g', 'kg', 'ml', 'L', 'pcs'];
const ICONS = ['🥗', '🥦', '🍎', '🥛', '🍞', '🍚', '🧂', '🧴', '🛒', '🍫'];

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

function EditPantryItem({ route, navigation }) {
  const { F } = useTheme();
  const { items, addItem, updateItem, removeItem, restoreItem, candidates } = usePantry();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const id = route?.params?.id;
  const editing = useMemo(
    () => (id ? items.find(p => p.id === id) : null),
    [id, items]
  );

  const [displayName,  setDisplayName]  = useState(editing?.display_name || '');
  const [unit,         setUnit]         = useState(editing?.canonical_unit || 'pcs');
  const [currentQty,   setCurrentQty]   = useState(editing ? String(editing.current_qty ?? 0) : '0');
  const [threshold,    setThreshold]    = useState(
    editing?.reorder_threshold != null ? String(editing.reorder_threshold) : '');
  const [target,       setTarget]       = useState(
    editing?.target_qty != null ? String(editing.target_qty) : '');
  const [icon,         setIcon]         = useState(editing?.icon || ICONS[0]);
  const [notes,        setNotes]        = useState(editing?.notes || '');
  const [candidateList, setCandidateList] = useState([]);
  const [pickedCandidate, setPickedCandidate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load candidate list on mount for the create flow.
  useEffect(() => {
    if (editing) return;
    (async () => {
      try {
        const c = await candidates({ limit: 30 });
        setCandidateList(c || []);
      } catch (err) { logError('editpantry:candidates', err); }
    })();
  }, [editing, candidates]);

  const handleCandidate = (c) => {
    setPickedCandidate(c);
    setDisplayName(c.display_name || c.normalized_name);
    setUnit(c.canonical_unit || 'pcs');
  };

  const save = async () => {
    if (!displayName.trim()) return Alert.alert('Name required');
    const cq = parseFloat(currentQty);
    if (!Number.isFinite(cq) || cq < 0) return Alert.alert('Current qty must be ≥ 0');
    const rt = threshold.trim() ? parseFloat(threshold) : null;
    if (rt != null && (!Number.isFinite(rt) || rt < 0)) return Alert.alert('Threshold must be ≥ 0');
    const tg = target.trim() ? parseFloat(target) : null;
    if (tg != null && (!Number.isFinite(tg) || tg < 0)) return Alert.alert('Target qty must be ≥ 0');

    setSaving(true);
    try {
      if (editing) {
        await updateItem(editing.id, {
          display_name: displayName.trim(),
          canonical_unit: unit,
          current_qty: cq,
          reorder_threshold: rt,
          target_qty: tg,
          notes: notes.trim() || null,
          icon,
        });
      } else {
        const nn = pickedCandidate?.normalized_name
          || normalizeName(displayName.trim()).normalized_name
          || displayName.trim().toLowerCase();
        await addItem({
          normalized_name: nn,
          display_name: displayName.trim(),
          kind: pickedCandidate?.kind || 'other',
          canonical_unit: unit,
          current_qty: cq,
          reorder_threshold: rt,
          target_qty: tg,
          notes: notes.trim() || null,
          icon,
        });
      }
      navigation.goBack();
    } catch (err) {
      logError('editpantry:save', err);
      Alert.alert('Could not save', err?.message || String(err));
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert(
      `Remove ${editing.display_name}?`,
      'The item leaves your pantry. Scan history is unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          const label = editing.display_name;
          const eid = editing.id;
          try {
            await removeItem(eid);
            navigation.goBack();
            toast(`Removed: ${label}`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try { await restoreItem(eid); }
                catch (err) {
                  logError('editpantry:undo', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
          } catch (err) {
            logError('editpantry:delete', err);
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

      {/* Candidate picker — create flow only */}
      {!editing && candidateList.length > 0 && (
        <Field F={F} label="QUICK PICK" sub="Items you've bought before — tap to pre-fill">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {candidateList.slice(0, 10).map((c) => {
              const sel = pickedCandidate?.normalized_name === c.normalized_name;
              return (
                <TouchableOpacity key={c.normalized_name} onPress={() => handleCandidate(c)}
                  activeOpacity={0.7}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                    backgroundColor: sel ? F.coral : F.surface,
                    borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                  <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink,
                    fontWeight: '600', textTransform: 'capitalize' }}>
                    {c.display_name || c.normalized_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>
      )}

      <Field F={F} label="NAME">
        <TextInput value={displayName} onChangeText={setDisplayName}
          placeholder="Milk"
          placeholderTextColor={F.ink3}
          autoCapitalize="words"
          editable={!editing /* normalized_name stable post-creation; rename via display only */}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: editing ? F.cream : F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      {editing && (
        <Field F={F} label="DISPLAY NAME" sub="The pantry row's display label">
          <TextInput value={displayName} onChangeText={setDisplayName}
            placeholder="Milk"
            placeholderTextColor={F.ink3}
            autoCapitalize="words"
            style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
              backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
        </Field>
      )}

      <Field F={F} label="UNIT">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {UNITS.map((u) => {
            const sel = u === unit;
            return (
              <TouchableOpacity key={u} onPress={() => setUnit(u)} activeOpacity={0.7}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink, fontWeight: '600' }}>
                  {u}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="CURRENT QTY" sub={`How much you have right now (${unit})`}>
        <NumericInput F={F} value={currentQty} onChange={setCurrentQty} placeholder="0"/>
      </Field>

      <Field F={F} label="REORDER THRESHOLD"
        sub="When qty drops to or below this, the item appears in Shopping and fires a low-stock notification. Leave blank to skip notifications.">
        <NumericInput F={F} value={threshold} onChange={setThreshold} placeholder="Optional"/>
      </Field>

      <Field F={F} label="TARGET QTY"
        sub="Used when you tap Bought on the shopping list — restocks to this value">
        <NumericInput F={F} value={target} onChange={setTarget} placeholder="Optional"/>
      </Field>

      <Field F={F} label="ICON">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ICONS.map((g) => {
            const sel = g === icon;
            return (
              <TouchableOpacity key={g} onPress={() => setIcon(g)} activeOpacity={0.7}
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
          {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add to pantry')}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={handleDelete} activeOpacity={0.7}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '600', fontSize: 13 }}>Remove from pantry</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditPantryItem);
