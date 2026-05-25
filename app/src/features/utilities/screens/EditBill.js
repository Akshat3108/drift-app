// 7.12 — EditBill screen. Atomic dual-write of expense + utility_bills row
// on save (mirrors 7.6 EditFillup pattern). Loaded with a `utility_account_id`
// for create flow, or `id` (bill id) for edit.

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useUtilities } from '@features/utilities/context';
import { useExpenses } from '@features/expenses/context';
import { useSettings } from '@features/profile/settings.context';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
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
      onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))}
      placeholder={placeholder}
      placeholderTextColor={F.ink3}
      keyboardType="decimal-pad"
      style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
        backgroundColor: F.surface, fontSize: 14, color: F.ink }}
    />
  );
}

function EditBill({ route, navigation }) {
  const { F } = useTheme();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { accounts, addBill, updateBill, removeBill, restoreBill, getBill } = useUtilities();
  const { expenses } = useExpenses();

  const billId = route?.params?.id;
  const presetAccountId = route?.params?.utility_account_id ?? null;

  const [bill, setBill] = useState(null);
  const account = useMemo(() => {
    const id = bill?.utility_account_id ?? presetAccountId;
    return id != null ? accounts.find(a => a.id === id) : null;
  }, [bill, presetAccountId, accounts]);
  const linkedExpense = useMemo(() => {
    const eid = bill?.expense_id;
    return eid != null ? expenses.find(e => e.id === eid) : null;
  }, [bill, expenses]);

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd,   setPeriodEnd]   = useState('');
  const [units,       setUnits]       = useState('');
  const [rate,        setRate]        = useState('');
  const [baseCharge,  setBaseCharge]  = useState('');
  const [taxes,       setTaxes]       = useState('');
  const [total,       setTotal]       = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [notes,       setNotes]       = useState('');
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    if (!billId) {
      // Create flow — seed period_end with today.
      setPeriodEnd(todayIso());
      return;
    }
    (async () => {
      const row = await getBill(billId);
      if (!row) return;
      setBill(row);
      setPeriodStart(row.period_start || '');
      setPeriodEnd(row.period_end || '');
      setUnits(row.units_consumed != null ? String(row.units_consumed) : '');
      setRate(row.rate_per_unit != null ? String(row.rate_per_unit) : '');
      setBaseCharge(row.base_charge != null ? String(row.base_charge) : '');
      setTaxes(row.taxes != null ? String(row.taxes) : '');
      setTotal(String(row.total ?? ''));
      setDueDate(row.due_date || '');
      setNotes(row.notes || '');
    })();
  }, [billId, getBill]);

  // Live-compute total when user enters parts. Only auto-fills when total
  // hasn't been manually edited (sentinel = empty).
  useEffect(() => {
    if (total) return;
    const u = parseFloat(units);
    const r = parseFloat(rate);
    const b = parseFloat(baseCharge);
    const t = parseFloat(taxes);
    if (Number.isFinite(u) && Number.isFinite(r)) {
      let auto = u * r;
      if (Number.isFinite(b)) auto += b;
      if (Number.isFinite(t)) auto += t;
      if (auto > 0) setTotal(auto.toFixed(2));
    }
  }, [units, rate, baseCharge, taxes, total]);

  async function onSave() {
    if (!account && !presetAccountId) {
      Alert.alert('No account', 'Open this from a utility account.');
      return;
    }
    if (!periodStart || !periodEnd) {
      Alert.alert('Period required', 'Enter both period start and end dates.');
      return;
    }
    const totalNum = parseFloat(total);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      Alert.alert('Total required', 'Enter a total amount > 0.');
      return;
    }
    const accountId = bill?.utility_account_id ?? presetAccountId;
    const acc = account || accounts.find(a => a.id === accountId);
    const billPayload = {
      utility_account_id: accountId,
      period_start: periodStart,
      period_end: periodEnd,
      units_consumed: units.trim() ? parseFloat(units) : null,
      rate_per_unit: rate.trim() ? parseFloat(rate) : null,
      base_charge: baseCharge.trim() ? parseFloat(baseCharge) : null,
      taxes: taxes.trim() ? parseFloat(taxes) : null,
      total: totalNum,
      due_date: dueDate.trim() || null,
      notes: notes.trim() || null,
    };
    setSaving(true);
    try {
      if (billId) {
        // Edit flow — only updates the bill row and the linked expense's
        // amount + expense_date if those changed.
        await updateBill(billId, {
          bill: billPayload,
          expense: linkedExpense ? {
            amount: totalNum,
            expense_date: periodEnd,
            notes: notes.trim() || null,
          } : null,
        });
        toast(`Saved bill: ${periodEnd}`);
      } else {
        await addBill({
          expense: {
            merchant: acc?.provider || acc?.name || 'Utility',
            amount: totalNum,
            expense_date: periodEnd,
            notes: notes.trim() || `${acc?.kind || 'utility'} bill`,
          },
          bill: billPayload,
        });
        toast(`Logged bill: ${periodEnd}`);
      }
      navigation.goBack();
    } catch (err) {
      logError('utilities:save-bill', err);
      Alert.alert('Save failed', err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!billId) return;
    Alert.alert('Remove bill?',
      'The linked expense stays in your history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await removeBill(billId);
            toast(`Removed bill`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try { await restoreBill(billId); }
                catch (err) {
                  logError('utilities:undo-delete-bill', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
            navigation.goBack();
          } catch (err) {
            logError('utilities:delete-bill', err);
            Alert.alert('Delete failed', err?.message || String(err));
          }
        }},
      ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 60, paddingHorizontal: 20 }}>

      <Text style={{ fontSize: 24, color: F.ink, marginBottom: 6 }}>
        {billId ? 'Edit bill' : 'Log bill'}
      </Text>
      {account && (
        <Text style={{ fontSize: 13, color: F.ink3, marginBottom: 16 }}>
          {account.icon} {account.name}{account.provider ? ` · ${account.provider}` : ''}
        </Text>
      )}

      <Field F={F} label="PERIOD START (YYYY-MM-DD)">
        <TextInput value={periodStart} onChangeText={setPeriodStart}
          placeholder="2026-04-01" placeholderTextColor={F.ink3}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>
      <Field F={F} label="PERIOD END (YYYY-MM-DD)">
        <TextInput value={periodEnd} onChangeText={setPeriodEnd}
          placeholder={todayIso()} placeholderTextColor={F.ink3}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>
      <Field F={F} label="UNITS CONSUMED" sub="kWh / m³ / GB / minutes — optional.">
        <NumericInput F={F} value={units} onChange={setUnits} placeholder="(optional)"/>
      </Field>
      <Field F={F} label="RATE PER UNIT" sub={`${sym}/unit — optional.`}>
        <NumericInput F={F} value={rate} onChange={setRate} placeholder="(optional)"/>
      </Field>
      <Field F={F} label="BASE / FIXED CHARGE" sub={`${sym} — optional.`}>
        <NumericInput F={F} value={baseCharge} onChange={setBaseCharge} placeholder="(optional)"/>
      </Field>
      <Field F={F} label="TAXES" sub={`${sym} — optional.`}>
        <NumericInput F={F} value={taxes} onChange={setTaxes} placeholder="(optional)"/>
      </Field>
      <Field F={F} label="TOTAL" sub="Auto-computed from parts when blank; override here for the exact billed amount.">
        <NumericInput F={F} value={total} onChange={setTotal} placeholder={`${sym} 0.00`}/>
      </Field>
      <Field F={F} label="DUE DATE (YYYY-MM-DD)">
        <TextInput value={dueDate} onChangeText={setDueDate}
          placeholder="(optional)" placeholderTextColor={F.ink3}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>
      <Field F={F} label="NOTES">
        <TextInput value={notes} onChangeText={setNotes}
          placeholder="(optional)" placeholderTextColor={F.ink3} multiline
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink, minHeight: 60 }}/>
      </Field>

      <TouchableOpacity onPress={onSave} disabled={saving} activeOpacity={0.85}
        style={{ marginTop: 8, padding: 16, borderRadius: 14, backgroundColor: F.coral,
          alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          {billId ? 'Save changes' : 'Log bill'}
        </Text>
      </TouchableOpacity>

      {billId && (
        <TouchableOpacity onPress={onDelete} activeOpacity={0.85}
          style={{ marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: F.surface,
            borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ color: F.coral, fontSize: 14, fontWeight: '500' }}>Remove bill</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditBill);
