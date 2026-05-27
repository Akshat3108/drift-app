// PS-10 — Create / edit an investment holding.
//
// Form: kind picker (chip row) → label → units → unit_cost → current_nav
// (with "stamp today as last_updated" hint) → linked account (optional) →
// notes. Live preview card shows market value + cost basis + gain.

import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useInvestments } from '@features/investments/context';
import { useAccounts } from '@features/accounts/context';
import { useSettings } from '@features/profile/settings.context';
import { HOLDING_KINDS, KIND_META } from '@features/investments/repo';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const COLORS = ['#6a8d73', '#a3c7e9', '#e88373', '#fbbf24', '#b09c8a', '#888', '#7d6555'];

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

function EditHolding({ route, navigation }) {
  const { F } = useTheme();
  const { holdings, addHolding, updateHolding, removeHolding, restoreHolding } = useInvestments();
  const { accounts } = useAccounts();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const id = route?.params?.id;
  const editing = id ? holdings.find(h => h.id === id) : null;

  const [kind,        setKind]        = useState(editing?.kind || 'mf');
  const [label,       setLabel]       = useState(editing?.label || '');
  const [units,       setUnits]       = useState(editing ? String(editing.units) : '');
  const [unitCost,    setUnitCost]    = useState(editing ? String(editing.unit_cost) : '');
  const [currentNav,  setCurrentNav]  = useState(editing ? String(editing.current_nav) : '');
  const [accountId,   setAccountId]   = useState(editing?.account_id || null);
  const [color,       setColor]       = useState(editing?.color || COLORS[0]);
  const [notes,       setNotes]       = useState(editing?.notes || '');
  const [saving,      setSaving]      = useState(false);

  const meta = KIND_META[kind] || KIND_META.other;

  const preview = useMemo(() => {
    const u = parseFloat(units);
    const c = parseFloat(unitCost);
    const n = parseFloat(currentNav);
    if (!Number.isFinite(u) || u <= 0) return { ready: false };
    if (!Number.isFinite(c) || c < 0) return { ready: false };
    if (!Number.isFinite(n) || n < 0) return { ready: false };
    const market = u * n;
    const cost = u * c;
    const gain = market - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    return { ready: true, market, cost, gain, gainPct };
  }, [units, unitCost, currentNav]);

  const assetAccounts = (accounts || []).filter(a => !a.deleted_at && a.kind === 'asset');

  const save = async () => {
    if (!label.trim()) return Alert.alert('Label required');
    const u = parseFloat(units);
    if (!Number.isFinite(u) || u <= 0) return Alert.alert('Enter valid units');
    const c = parseFloat(unitCost);
    if (!Number.isFinite(c) || c < 0) return Alert.alert('Enter a valid unit cost');
    const n = parseFloat(currentNav);
    if (!Number.isFinite(n) || n < 0) return Alert.alert('Enter a valid current NAV');

    // Stamp last_updated to today when current_nav changed (new or edited).
    const navChanged = !editing || Number(editing.current_nav) !== n;
    const lastUpdated = navChanged ? todayIso() : (editing?.last_updated || todayIso());

    const payload = {
      kind, label: label.trim(),
      units: u, unit_cost: c, current_nav: n,
      last_updated: lastUpdated,
      account_id: accountId || null,
      notes: notes.trim() || null,
      icon: meta.icon,
      color,
    };

    setSaving(true);
    try {
      if (editing) await updateHolding(editing.id, payload);
      else         await addHolding(payload);
      navigation.goBack();
    } catch (err) {
      logError('editholding:save', err);
      Alert.alert('Could not save', err?.message || String(err));
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert(
      `Delete ${editing.label}?`,
      'The holding goes away. You can undo right after.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const lbl = editing.label;
          const eid = editing.id;
          try {
            await removeHolding(eid);
            navigation.goBack();
            toast(`Deleted: ${lbl}`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try { await restoreHolding(eid); }
                catch (err) {
                  logError('editholding:undo-delete', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
          } catch (err) {
            logError('editholding:delete', err);
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

      <Field F={F} label="KIND">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {HOLDING_KINDS.map((k) => {
            const km = KIND_META[k];
            const sel = k === kind;
            return (
              <TouchableOpacity key={k} onPress={() => setKind(k)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`Kind ${km.label}`}
                accessibilityState={{ selected: sel }}
                style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line,
                  flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14 }}>{km.icon}</Text>
                <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink }}>
                  {km.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="LABEL" sub="e.g. 'HDFC Top 100 Direct' or 'INFY'">
        <TextInput value={label} onChangeText={setLabel}
          placeholder={meta.label}
          placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label={`UNITS (${meta.unitLabel.toUpperCase()})`}
        sub={kind === 'fd' || kind === 'rd' || kind === 'ppf' ? 'Use 1 — value lives in NAV/unit-cost' : 'Decimal allowed'}>
        <NumericInput F={F} value={units} onChange={setUnits} placeholder="1"/>
      </Field>

      <Field F={F} label="UNIT COST" sub={`Avg buy price in ${sym} — used for cost basis & gain`}>
        <NumericInput F={F} value={unitCost} onChange={setUnitCost} placeholder="0"/>
      </Field>

      <Field F={F} label="CURRENT NAV"
        sub={`Latest market value per unit in ${sym}. Stamps "updated today".`}>
        <NumericInput F={F} value={currentNav} onChange={setCurrentNav} placeholder="0"/>
      </Field>

      <Field F={F} label="LINKED ACCOUNT" sub="Optional — e.g. your demat account">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity onPress={() => setAccountId(null)} activeOpacity={0.7}
            style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
              backgroundColor: accountId == null ? F.coral : F.surface,
              borderWidth: 1, borderColor: accountId == null ? F.coral : F.line }}>
            <Text style={{ fontSize: 12, color: accountId == null ? '#fff' : F.ink }}>None</Text>
          </TouchableOpacity>
          {assetAccounts.map((a) => {
            const sel = a.id === accountId;
            return (
              <TouchableOpacity key={a.id} onPress={() => setAccountId(a.id)} activeOpacity={0.7}
                style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line,
                  flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 12 }}>{a.emoji || '💼'}</Text>
                <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink }}>{a.label}</Text>
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

      {preview.ready && (
        <View style={{ backgroundColor: F.cream, borderRadius: 18, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>
            PREVIEW
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <Text style={{ fontSize: 20, color: F.ink, fontWeight: '500' }}>
              {sym}{Math.round(preview.market).toLocaleString('en-IN')}
            </Text>
            <Text style={{ fontSize: 12, color: F.ink2 }}>market value</Text>
          </View>
          <Text style={{ fontSize: 11, color: F.ink2 }}>
            Cost basis {sym}{Math.round(preview.cost).toLocaleString('en-IN')} ·{' '}
            <Text style={{ color: preview.gain >= 0 ? (F.sageD || '#3a8755') : F.coral }}>
              {preview.gain >= 0 ? '+' : '−'}{sym}{Math.abs(Math.round(preview.gain)).toLocaleString('en-IN')}
              {' '}({preview.gainPct >= 0 ? '+' : ''}{preview.gainPct.toFixed(1)}%)
            </Text>
          </Text>
        </View>
      )}

      <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center',
          opacity: saving ? 0.6 : 1, marginBottom: editing ? 12 : 0 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add holding')}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={handleDelete} activeOpacity={0.7}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '600', fontSize: 13 }}>Delete holding</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditHolding);
