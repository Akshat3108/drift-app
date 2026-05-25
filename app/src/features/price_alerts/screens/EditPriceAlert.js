// 7.8 — EditPriceAlert screen: create / edit a price alert.
//
// Form fields: item picker (when create-flow; otherwise display-only), ceiling
// price, jump %, baseline price (auto-stamped, editable), enabled toggle,
// notes. Live "Would fire when …" preview below the form.

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { usePriceAlerts } from '@features/price_alerts/context';
import { useSettings } from '@features/profile/settings.context';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function fmt(sym, n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function Field({ F, label, sub, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </Text>
      {children}
      {!!sub && <Text style={{ fontSize: 11, color: F.ink3, marginTop: 4 }}>{sub}</Text>}
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

function EditPriceAlert({ route, navigation }) {
  const { F } = useTheme();
  const { alerts, addAlert, updateAlert, removeAlert, restoreAlert, candidates } = usePriceAlerts();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  // Three entry modes:
  //   - route.params.id: edit existing
  //   - route.params.normalized_name + display_name: create from ItemTrend
  //   - no params: create flow, must pick from candidates
  const id = route?.params?.id;
  const presetName = route?.params?.normalized_name || null;
  const presetDisplay = route?.params?.display_name || null;
  const editing = id ? alerts.find(a => a.id === id) : null;

  const [normalizedName, setNormalizedName] = useState(
    editing?.normalized_name || presetName || ''
  );
  const [displayName, setDisplayName] = useState(
    editing?.display_name || presetDisplay || ''
  );
  const [ceiling, setCeiling] = useState(
    editing?.ceiling_price != null ? String(editing.ceiling_price) : ''
  );
  const [jumpPct, setJumpPct] = useState(
    editing?.jump_pct != null ? String(editing.jump_pct) : ''
  );
  const [baseline, setBaseline] = useState(
    editing?.baseline_price != null ? String(editing.baseline_price) : ''
  );
  const [enabled, setEnabled] = useState(editing ? !!editing.enabled : true);
  const [notes, setNotes] = useState(editing?.notes || '');
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState([]);

  // When in create flow without a preset, load candidates the user can pick from.
  useEffect(() => {
    if (id || presetName) return;
    let cancelled = false;
    (async () => {
      const list = await candidates({ limit: 50 });
      if (!cancelled) setPicker(list || []);
    })();
    return () => { cancelled = true; };
  }, [id, presetName, candidates]);

  const fired = useMemo(() => {
    const c = ceiling.trim() ? Number(ceiling) : null;
    const j = jumpPct.trim() ? Number(jumpPct) : null;
    const b = baseline.trim() ? Number(baseline) : null;
    if (c == null && j == null) return 'No trigger set — nothing will fire.';
    const parts = [];
    if (c != null && Number.isFinite(c)) parts.push(`scan price exceeds ${fmt(sym, c)}`);
    if (j != null && Number.isFinite(j) && b != null && Number.isFinite(b) && b > 0) {
      const target = b * (1 + j / 100);
      parts.push(`scan price exceeds ${fmt(sym, target)} (${Math.round(j)}% jump from ${fmt(sym, b)})`);
    } else if (j != null && Number.isFinite(j)) {
      parts.push(`scan price exceeds +${Math.round(j)}% over baseline (baseline not set yet)`);
    }
    return `Fires when ${parts.join(' OR ')}.`;
  }, [ceiling, jumpPct, baseline, sym]);

  async function onSave() {
    if (!normalizedName || !displayName) {
      Alert.alert('Pick an item', 'Choose an item to watch.');
      return;
    }
    const cVal = ceiling.trim() ? Number(ceiling) : null;
    const jVal = jumpPct.trim() ? Number(jumpPct) : null;
    const bVal = baseline.trim() ? Number(baseline) : null;
    if (cVal != null && !(cVal > 0)) {
      Alert.alert('Ceiling must be > 0', 'Or leave it blank.');
      return;
    }
    if (jVal != null && !(jVal > 0)) {
      Alert.alert('Jump % must be > 0', 'Or leave it blank.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateAlert(editing.id, {
          display_name: displayName,
          ceiling_price: cVal,
          jump_pct: jVal,
          baseline_price: bVal,
          enabled: enabled ? 1 : 0,
          notes: notes || null,
        });
        toast(`Saved: ${displayName}`);
      } else {
        await addAlert({
          normalized_name: normalizedName,
          display_name: displayName,
          ceiling_price: cVal,
          jump_pct: jVal,
          baseline_price: bVal,
          enabled: enabled ? 1 : 0,
          notes: notes || null,
        });
        toast(`Watching: ${displayName}`);
      }
      navigation.goBack();
    } catch (err) {
      logError('price_alerts:save', err);
      Alert.alert('Save failed', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!editing) return;
    Alert.alert('Delete alert?', `Stop watching ${editing.display_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await removeAlert(editing.id);
          toast(`Deleted: ${editing.display_name}`, {
            actionLabel: 'Undo',
            onAction: async () => {
              try { await restoreAlert(editing.id); }
              catch (err) {
                logError('price_alerts:undo-delete', err);
                Alert.alert('Restore failed', err?.message || String(err));
              }
            },
          });
          navigation.goBack();
        } catch (err) {
          logError('price_alerts:delete', err);
          Alert.alert('Delete failed', err?.message || String(err));
        }
      }},
    ]);
  }

  const itemLocked = !!editing || !!presetName;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 60, paddingHorizontal: 20 }}>

      <Text style={{ fontSize: 24, color: F.ink, marginBottom: 20 }}>
        {editing ? 'Edit alert' : 'Watch price'}
      </Text>

      <Field F={F} label="ITEM">
        {itemLocked ? (
          <View style={{ padding: 14, borderRadius: 12, borderWidth: 1,
            borderColor: F.line, backgroundColor: F.cream }}>
            <Text style={{ fontSize: 15, color: F.ink, fontWeight: '500' }}>{displayName}</Text>
            <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>{normalizedName}</Text>
          </View>
        ) : (
          <View>
            {picker.length === 0 && (
              <Text style={{ fontSize: 13, color: F.ink3 }}>
                No tracked items yet. Scan a few receipts first, then come back.
              </Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 4 }}>
              {picker.map((cand) => {
                const selected = cand.normalized_name === normalizedName;
                return (
                  <TouchableOpacity key={cand.normalized_name}
                    onPress={() => {
                      setNormalizedName(cand.normalized_name);
                      setDisplayName(cand.display_name);
                      if (!baseline && cand.last_unit_price != null) {
                        setBaseline(String(cand.last_unit_price));
                      }
                    }}
                    activeOpacity={0.8}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8,
                      borderRadius: 18, marginRight: 8,
                      backgroundColor: selected ? F.coral : F.surface,
                      borderWidth: 1, borderColor: selected ? F.coral : F.line,
                    }}>
                    <Text style={{ fontSize: 13,
                      color: selected ? '#fff' : F.ink }}>
                      {cand.display_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </Field>

      <Field F={F} label="ALERT WHEN PRICE EXCEEDS"
             sub="Optional. Fires once per scan-day when the scanned unit price goes above this.">
        <NumericInput F={F} value={ceiling} onChange={setCeiling} placeholder="(optional)"/>
      </Field>

      <Field F={F} label="OR JUMPS BY %"
             sub="Optional. Fires when scanned price exceeds baseline × (1 + %).">
        <NumericInput F={F} value={jumpPct} onChange={setJumpPct} placeholder="(optional)"/>
      </Field>

      <Field F={F} label="BASELINE PRICE"
             sub="Anchor for the % jump check. Auto-stamped from the item's last seen price; updates after each fire.">
        <NumericInput F={F} value={baseline} onChange={setBaseline} placeholder="(none)"/>
      </Field>

      <Field F={F} label="ENABLED">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch value={enabled} onValueChange={setEnabled}/>
          <Text style={{ fontSize: 13, color: F.ink2 }}>
            {enabled ? 'Watching — checks fire on every scan.' : 'Paused — no fires until re-enabled.'}
          </Text>
        </View>
      </Field>

      <Field F={F} label="NOTES">
        <TextInput
          value={notes} onChangeText={setNotes}
          placeholder="(optional)" placeholderTextColor={F.ink3} multiline
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink, minHeight: 60 }}
        />
      </Field>

      <View style={{ marginTop: 8, padding: 14, borderRadius: 14,
        backgroundColor: F.cream, borderWidth: 1, borderColor: F.line }}>
        <Text style={{ fontSize: 11, color: F.ink3, letterSpacing: 1, fontWeight: '700',
          marginBottom: 4 }}>WOULD FIRE</Text>
        <Text style={{ fontSize: 13, color: F.ink }}>{fired}</Text>
      </View>

      <TouchableOpacity onPress={onSave} disabled={saving}
        activeOpacity={0.85}
        style={{ marginTop: 22, padding: 16, borderRadius: 14, backgroundColor: F.coral,
          alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          {editing ? 'Save changes' : 'Start watching'}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={onDelete}
          activeOpacity={0.85}
          style={{ marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: F.surface,
            borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ color: F.coral, fontSize: 14, fontWeight: '500' }}>Delete alert</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditPriceAlert);
