// PS-11 — Create / edit an insurance policy.

import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useInsurance } from '@features/insurance/context';
import { useAccounts } from '@features/accounts/context';
import { useSettings } from '@features/profile/settings.context';
import {
  INSURANCE_KINDS, KIND_META, FREQUENCY_FACTORS, monthlyEquivalent,
} from '@features/insurance/repo';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const COLORS = ['#a3c7e9', '#6a8d73', '#e88373', '#fbbf24', '#b09c8a', '#888', '#7d6555'];

const FREQ_OPTIONS = [
  { key: 'monthly',     label: 'Monthly' },
  { key: 'quarterly',   label: 'Quarterly' },
  { key: 'half_yearly', label: 'Half-yearly' },
  { key: 'yearly',      label: 'Yearly' },
];

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

function EditInsurance({ route, navigation }) {
  const { F } = useTheme();
  const { policies, addPolicy, updatePolicy, removePolicy, restorePolicy } = useInsurance();
  const { accounts } = useAccounts();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const id = route?.params?.id;
  const editing = id ? policies.find(p => p.id === id) : null;

  const [kind,        setKind]        = useState(editing?.kind || 'life');
  const [label,       setLabel]       = useState(editing?.label || '');
  const [provider,    setProvider]    = useState(editing?.provider || '');
  const [premium,     setPremium]     = useState(editing ? String(editing.premium_amount) : '');
  const [frequency,   setFrequency]   = useState(editing?.premium_frequency || 'yearly');
  const [nextDue,     setNextDue]     = useState(editing?.next_due || '');
  const [sumAssured,  setSumAssured]  = useState(editing?.sum_assured != null ? String(editing.sum_assured) : '');
  const [maturity,    setMaturity]    = useState(editing?.maturity_date || '');
  const [accountId,   setAccountId]   = useState(editing?.account_id || null);
  const [policyNumber,setPolicyNumber]= useState(editing?.policy_number || '');
  const [color,       setColor]       = useState(editing?.color || COLORS[0]);
  const [notes,       setNotes]       = useState(editing?.notes || '');
  const [saving,      setSaving]      = useState(false);

  const meta = KIND_META[kind] || KIND_META.other;

  const monthlyPreview = useMemo(() => {
    const p = parseFloat(premium);
    if (!Number.isFinite(p) || p <= 0) return 0;
    const months = FREQUENCY_FACTORS[frequency] || 12;
    return p / months;
  }, [premium, frequency]);

  const liveAccounts = (accounts || []).filter(a => !a.deleted_at);

  const save = async () => {
    if (!label.trim()) return Alert.alert('Label required');
    const p = parseFloat(premium);
    if (!Number.isFinite(p) || p <= 0) return Alert.alert('Enter a valid premium amount');
    if (nextDue && !/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) {
      return Alert.alert('Next due must be YYYY-MM-DD or blank');
    }
    if (maturity && !/^\d{4}-\d{2}-\d{2}$/.test(maturity)) {
      return Alert.alert('Maturity date must be YYYY-MM-DD or blank');
    }
    const sa = sumAssured.trim() ? parseFloat(sumAssured) : null;
    if (sa != null && (!Number.isFinite(sa) || sa < 0)) {
      return Alert.alert('Sum assured must be a positive number or blank');
    }

    const payload = {
      kind, label: label.trim(),
      provider: provider.trim() || null,
      premium_amount: p,
      premium_frequency: frequency,
      next_due: nextDue.trim() || null,
      sum_assured: sa,
      maturity_date: maturity.trim() || null,
      account_id: accountId || null,
      policy_number: policyNumber.trim() || null,
      notes: notes.trim() || null,
      icon: meta.icon,
      color,
    };

    setSaving(true);
    try {
      if (editing) await updatePolicy(editing.id, payload);
      else         await addPolicy(payload);
      navigation.goBack();
    } catch (err) {
      logError('editinsurance:save', err);
      Alert.alert('Could not save', err?.message || String(err));
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert(
      `Delete ${editing.label}?`,
      'The policy goes away. Linked premium expenses keep existing but lose their policy link.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const lbl = editing.label;
          const eid = editing.id;
          try {
            await removePolicy(eid);
            navigation.goBack();
            toast(`Deleted: ${lbl}`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try { await restorePolicy(eid); }
                catch (err) {
                  logError('editinsurance:undo-delete', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
          } catch (err) {
            logError('editinsurance:delete', err);
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
          {INSURANCE_KINDS.map((k) => {
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

      <Field F={F} label="LABEL" sub="e.g. 'LIC Jeevan Anand' or 'Star Health Family'">
        <TextInput value={label} onChangeText={setLabel}
          placeholder={meta.label}
          placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="PROVIDER" sub="Optional — e.g. LIC, HDFC Life, Star Health">
        <TextInput value={provider} onChangeText={setProvider}
          placeholder="Provider"
          placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="PREMIUM AMOUNT" sub={`Billed per cycle in ${sym}`}>
        <NumericInput F={F} value={premium} onChange={setPremium} placeholder="0"/>
      </Field>

      <Field F={F} label="PREMIUM FREQUENCY"
        sub={monthlyPreview > 0 ? `≈ ${sym}${Math.round(monthlyPreview).toLocaleString('en-IN')} per month` : null}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FREQ_OPTIONS.map((opt) => {
            const sel = opt.key === frequency;
            return (
              <TouchableOpacity key={opt.key} onPress={() => setFrequency(opt.key)} activeOpacity={0.7}
                style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink }}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="NEXT DUE" sub="YYYY-MM-DD — drives renewal reminder">
        <TextInput value={nextDue} onChangeText={setNextDue}
          placeholder="2026-08-01"
          placeholderTextColor={F.ink3}
          autoCapitalize="none" autoCorrect={false}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="SUM ASSURED" sub={`Optional — display only`}>
        <NumericInput F={F} value={sumAssured} onChange={setSumAssured} placeholder="0"/>
      </Field>

      <Field F={F} label="MATURITY DATE" sub="Optional — YYYY-MM-DD">
        <TextInput value={maturity} onChangeText={setMaturity}
          placeholder="2046-08-01"
          placeholderTextColor={F.ink3}
          autoCapitalize="none" autoCorrect={false}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="POLICY NUMBER" sub="Optional">
        <TextInput value={policyNumber} onChangeText={setPolicyNumber}
          placeholder="Policy number"
          placeholderTextColor={F.ink3}
          autoCapitalize="characters" autoCorrect={false}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="LINKED ACCOUNT" sub="Optional — debits this account">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity onPress={() => setAccountId(null)} activeOpacity={0.7}
            style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
              backgroundColor: accountId == null ? F.coral : F.surface,
              borderWidth: 1, borderColor: accountId == null ? F.coral : F.line }}>
            <Text style={{ fontSize: 12, color: accountId == null ? '#fff' : F.ink }}>None</Text>
          </TouchableOpacity>
          {liveAccounts.map((a) => {
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

      <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center',
          opacity: saving ? 0.6 : 1, marginBottom: editing ? 12 : 0 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add policy')}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={handleDelete} activeOpacity={0.7}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '600', fontSize: 13 }}>Delete policy</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditInsurance);
