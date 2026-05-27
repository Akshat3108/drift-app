// 7.5 — EditEMI screen: create / edit an EMI loan.
//
// Form fields (top-to-bottom): name, lender, icon+colour picker, principal,
// rate, tenure (with "X years Y months" hint), start date, bill day, optional
// EMI override (with computed-EMI hint + drift display when set), installments
// already paid (mid-loan setup), notes.
//
// Below the form: a "Schedule preview" card showing computed EMI + the next 3
// upcoming installments — communicates that the math works against the inputs.

import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useEmi } from '@features/emi/context';
import { useSettings } from '@features/profile/settings.context';
import { computeEMI, projectState, tenureLabel } from '@features/emi/amortization';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const ICONS  = ['🏦', '🏠', '🚗', '🎓', '💳', '💼', '📱', '✈️'];
const COLORS = ['#888', '#7d6555', '#e88373', '#6a8d73', '#b09c8a', '#a3c7e9', '#d9272e', '#fbbf24'];

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

function EditEMI({ route, navigation }) {
  const { F } = useTheme();
  const { loans, addLoan, updateLoan, removeLoan, restoreLoan } = useEmi();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const id = route?.params?.id;
  const editing = id ? loans.find(l => l.id === id) : null;

  const [name,             setName]             = useState(editing?.name || '');
  const [lender,           setLender]           = useState(editing?.lender || '');
  const [icon,             setIcon]             = useState(editing?.icon || ICONS[0]);
  const [color,            setColor]            = useState(editing?.color || COLORS[0]);
  const [principal,        setPrincipal]        = useState(editing ? String(editing.principal) : '');
  const [rate,             setRate]             = useState(editing ? String(editing.annual_rate_pct) : '');
  const [tenure,           setTenure]           = useState(editing ? String(editing.tenure_months) : '');
  const [startDate,        setStartDate]        = useState(editing?.start_date || todayIso());
  const [billDay,          setBillDay]          = useState(editing ? String(editing.bill_day) : '1');
  const [installmentsPaid, setInstallmentsPaid] = useState(editing ? String(editing.installments_paid) : '0');
  const [emiOverride,      setEmiOverride]      = useState(
    editing?.emi_override != null ? String(editing.emi_override) : '',
  );
  const [kind,             setKind]             = useState(editing?.kind || null);
  // PS-12 — tri-state: null = follow implicit rule (home loan eligible),
  // 1 = explicitly eligible, 0 = explicitly ineligible.
  const [taxEligible,      setTaxEligible]      = useState(editing?.tax_eligible ?? null);
  const [notes,            setNotes]            = useState(editing?.notes || '');
  const [saving,           setSaving]           = useState(false);

  // Live computed values for the schedule preview card.
  const preview = useMemo(() => {
    const P = parseFloat(principal);
    const r = parseFloat(rate);
    const n = parseInt(tenure, 10);
    const b = parseInt(billDay, 10);
    const ip = parseInt(installmentsPaid, 10);
    const ov = emiOverride.trim() ? parseFloat(emiOverride) : null;
    if (!Number.isFinite(P) || P <= 0) return { ready: false };
    if (!Number.isFinite(r) || r < 0)  return { ready: false };
    if (!Number.isInteger(n) || n <= 0) return { ready: false };
    const fakeLoan = {
      principal: P,
      annual_rate_pct: r,
      tenure_months: n,
      start_date: startDate,
      bill_day: Number.isInteger(b) && b >= 1 && b <= 28 ? b : 1,
      installments_paid: Number.isInteger(ip) ? Math.max(0, Math.min(n, ip)) : 0,
      emi_override: ov,
    };
    return projectState(fakeLoan);
  }, [principal, rate, tenure, startDate, billDay, installmentsPaid, emiOverride]);

  const computedEMI = useMemo(() => {
    const P = parseFloat(principal);
    const r = parseFloat(rate);
    const n = parseInt(tenure, 10);
    if (!Number.isFinite(P) || P <= 0) return 0;
    if (!Number.isFinite(r) || r < 0)  return 0;
    if (!Number.isInteger(n) || n <= 0) return 0;
    return computeEMI(P, r, n);
  }, [principal, rate, tenure]);

  const overrideDrift = useMemo(() => {
    const ov = parseFloat(emiOverride);
    if (!Number.isFinite(ov) || ov <= 0) return null;
    if (computedEMI <= 0) return null;
    return Math.round((ov - computedEMI) * 100) / 100;
  }, [emiOverride, computedEMI]);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name required');
    const P = parseFloat(principal);
    if (!Number.isFinite(P) || P <= 0) return Alert.alert('Enter a valid principal');
    const r = parseFloat(rate);
    if (!Number.isFinite(r) || r < 0) return Alert.alert('Enter a valid annual rate');
    const n = parseInt(tenure, 10);
    if (!Number.isInteger(n) || n <= 0) return Alert.alert('Enter a valid tenure (months)');
    const b = parseInt(billDay, 10);
    if (!Number.isInteger(b) || b < 1 || b > 28) return Alert.alert('Bill day must be 1–28');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return Alert.alert('Start date must be YYYY-MM-DD');
    const ip = parseInt(installmentsPaid, 10) || 0;
    if (ip < 0 || ip > n) return Alert.alert(`Installments paid must be between 0 and ${n}`);
    const ov = emiOverride.trim() ? parseFloat(emiOverride) : null;
    if (ov != null && (!Number.isFinite(ov) || ov <= 0)) return Alert.alert('EMI override must be a positive number');

    const payload = {
      name: name.trim(),
      lender: lender.trim() || null,
      principal: P,
      annual_rate_pct: r,
      tenure_months: n,
      start_date: startDate,
      installments_paid: ip,
      emi_override: ov,
      bill_day: b,
      notes: notes.trim() || null,
      icon,
      color,
      kind,
      tax_eligible: taxEligible,
    };

    setSaving(true);
    try {
      if (editing) await updateLoan(editing.id, payload);
      else         await addLoan(payload);
      navigation.goBack();
    } catch (err) {
      logError('editemi:save', err);
      Alert.alert('Could not save', err?.message || String(err));
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!editing) return;
    Alert.alert(
      `Delete ${editing.name}?`,
      'The loan goes away. Linked payment expenses keep existing but lose their loan link.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const label = editing.name;
          const eid = editing.id;
          try {
            await removeLoan(eid);
            navigation.goBack();
            toast(`Deleted: ${label}`, {
              actionLabel: 'Undo',
              onAction: async () => {
                try { await restoreLoan(eid); }
                catch (err) {
                  logError('editemi:undo-delete', err);
                  Alert.alert('Restore failed', err?.message || String(err));
                }
              },
            });
          } catch (err) {
            logError('editemi:delete', err);
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
          placeholder="Home Loan — HDFC"
          placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="LENDER" sub="Optional — e.g. HDFC, SBI, Bajaj">
        <TextInput value={lender} onChangeText={setLender}
          placeholder="Lender"
          placeholderTextColor={F.ink3}
          autoCapitalize="characters"
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

      <Field F={F} label="PRINCIPAL" sub={`Original loan amount in ${sym}`}>
        <NumericInput F={F} value={principal} onChange={setPrincipal} placeholder="5000000"/>
      </Field>

      <Field F={F} label="ANNUAL RATE %" sub="e.g. 8.5 for 8.5% per year">
        <NumericInput F={F} value={rate} onChange={setRate} placeholder="8.5"/>
      </Field>

      <Field F={F} label="TENURE (MONTHS)" sub={tenureLabel(parseInt(tenure, 10)) || 'How many months total'}>
        <NumericInput F={F} value={tenure} onChange={setTenure} placeholder="240"/>
      </Field>

      <Field F={F} label="START DATE" sub="YYYY-MM-DD — the month of the first installment">
        <TextInput value={startDate} onChangeText={setStartDate}
          placeholder={todayIso()}
          placeholderTextColor={F.ink3}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="BILL DAY OF MONTH" sub="1–28 (capped to dodge Feb edge cases)">
        <NumericInput F={F} value={billDay} onChange={setBillDay} placeholder="1"/>
      </Field>

      <Field F={F} label="INSTALLMENTS ALREADY PAID"
        sub={editing ? 'Used to compute outstanding balance + next due' : 'Leave at 0 for new loans'}>
        <NumericInput F={F} value={installmentsPaid} onChange={setInstallmentsPaid} placeholder="0"/>
      </Field>

      <Field F={F} label="EMI OVERRIDE"
        sub={
          emiOverride.trim()
            ? (Number.isFinite(overrideDrift)
                ? `Computed ${sym}${computedEMI.toLocaleString('en-IN')} · drift ${overrideDrift >= 0 ? '+' : ''}${sym}${Math.abs(overrideDrift).toLocaleString('en-IN')}`
                : `Computed ${sym}${computedEMI.toLocaleString('en-IN')}`)
            : (computedEMI > 0
                ? `Computed ${sym}${computedEMI.toLocaleString('en-IN')} — leave blank to use this`
                : 'Optional — your bank-stated EMI if the computed value drifts')
        }>
        <NumericInput F={F} value={emiOverride} onChange={setEmiOverride}
          placeholder={computedEMI > 0 ? String(computedEMI) : 'Optional'}/>
      </Field>

      {/* PS-12 — Kind + tax eligibility. Drives the TaxBenefit screen + FY export. */}
      <Field F={F} label="LOAN KIND" sub="Home loans unlock 80C / 24B tax deductions">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { key: null,           label: 'Unspecified' },
            { key: 'home',         label: 'Home' },
            { key: 'car',          label: 'Car' },
            { key: 'personal',     label: 'Personal' },
            { key: 'education',    label: 'Education' },
            { key: 'other',        label: 'Other' },
          ].map((opt) => {
            const sel = opt.key === kind;
            return (
              <TouchableOpacity key={opt.label} onPress={() => setKind(opt.key)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{ selected: sel }}
                style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink }}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="80C / 24B TAX BENEFIT"
        sub={
          taxEligible == null
            ? (kind === 'home' ? 'Auto: eligible (home loan default)' : 'Auto: not eligible')
            : (taxEligible ? 'Marked eligible' : 'Marked NOT eligible')
        }>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { key: null, label: 'Auto' },
            { key: 1,    label: 'Eligible' },
            { key: 0,    label: 'Not eligible' },
          ].map((opt) => {
            const sel = opt.key === taxEligible;
            return (
              <TouchableOpacity key={opt.label} onPress={() => setTaxEligible(opt.key)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityState={{ selected: sel }}
                style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink }}>{opt.label}</Text>
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

      {/* Schedule preview */}
      {preview.ready && (
        <View style={{ backgroundColor: F.cream, borderRadius: 18, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>
            SCHEDULE PREVIEW
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <Text style={{ fontSize: 20, color: F.ink, fontWeight: '500' }}>
              {sym}{preview.emiAmount.toLocaleString('en-IN')}
            </Text>
            <Text style={{ fontSize: 12, color: F.ink2 }}>per month</Text>
          </View>
          <Text style={{ fontSize: 11, color: F.ink2, marginBottom: 8 }}>
            Total interest {sym}{preview.totalInterest.toLocaleString('en-IN')} ·
            Total paid {sym}{preview.totalPaid.toLocaleString('en-IN')}
          </Text>
          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 4 }}>
            NEXT 3 INSTALLMENTS
          </Text>
          {preview.schedule
            .slice(preview.installmentsPaid, preview.installmentsPaid + 3)
            .map((row) => (
              <Text key={row.installmentNumber} style={{ fontSize: 12, color: F.ink2 }}>
                #{row.installmentNumber} · {row.dueDate} · {sym}{row.payment.toLocaleString('en-IN')}
                {' '}(int {sym}{row.interest_paid.toLocaleString('en-IN')})
              </Text>
            ))}
        </View>
      )}

      <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center',
          opacity: saving ? 0.6 : 1, marginBottom: editing ? 12 : 0 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add EMI')}
        </Text>
      </TouchableOpacity>

      {editing && (
        <TouchableOpacity onPress={handleDelete} activeOpacity={0.7}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '600', fontSize: 13 }}>Delete EMI</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

export default React.memo(EditEMI);
