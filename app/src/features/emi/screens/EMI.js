// 7.5 — EMI list screen.
//
// Hero card: total monthly commitment + active loan count + total outstanding.
// Per-loan rows: icon, name, lender, monthly EMI, "X of N paid · ₹{outstanding} left"
// + a small progress bar. Tap → EditEMI; long-press → soft-delete with Undo.
// FAB → EditEMI (create flow).

import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useEmi } from '@features/emi/context';
import { useSettings } from '@features/profile/settings.context';
import { projectState } from '@features/emi/amortization';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function ProgressBar({ pct, F }) {
  const clamped = Math.max(0, Math.min(1, pct || 0));
  return (
    <View style={{ height: 4, backgroundColor: F.cream, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ width: `${clamped * 100}%`, height: 4, backgroundColor: F.coral, borderRadius: 2 }}/>
    </View>
  );
}

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function EMI({ navigation }) {
  const { F } = useTheme();
  const { loans, linkedCounts, removeLoan, restoreLoan } = useEmi();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  // Project every loan once so the list rows have computed EMI + outstanding
  // without re-running the amortization formula per render. asOf is "now".
  const projected = useMemo(() => loans.map((loan) => ({
    loan,
    state: projectState(loan, { asOf: new Date() }),
    paidCount: linkedCounts?.[loan.id] || 0,
  })), [loans, linkedCounts]);

  const totals = useMemo(() => {
    let monthly = 0, outstanding = 0;
    for (const { state } of projected) {
      if (!state.ready) continue;
      monthly     += state.emiAmount;
      outstanding += state.outstandingPrincipal;
    }
    return { monthly, outstanding };
  }, [projected]);

  const handleLongPress = useCallback(async (loan) => {
    try {
      await removeLoan(loan.id);
      toast(`Deleted: ${loan.name}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreLoan(loan.id); }
          catch (err) {
            logError('emi:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('emi:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removeLoan, restoreLoan, toast]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Monthly EMI commitment</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {fmt(sym, totals.monthly)}<Text style={{ fontSize: 18, color: F.ink2 }}> /mo</Text>
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 12 }}>
          {loans.length} loan{loans.length === 1 ? '' : 's'} ·{' '}
          <Text style={{ color: F.coral }}>{fmt(sym, totals.outstanding)} outstanding</Text>
        </Text>

        {loans.length > 0 && (
          <TouchableOpacity
            onPress={() => navigation.navigate('TaxBenefit')}
            activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel="Open tax benefit"
            style={{ backgroundColor: F.cream, padding: 12, borderRadius: 14,
              flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Text style={{ fontSize: 20 }}>🧾</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
                Tax benefit & prepayment simulator
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3 }}>
                80C / 24B for the current FY + "what if I prepay" math
              </Text>
            </View>
            <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
          </TouchableOpacity>
        )}

        {loans.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🏦</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No EMIs yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to track a home loan, car loan, or any EMI.
            </Text>
          </View>
        )}

        {projected.map(({ loan, state, paidCount }) => {
          const pct = state.ready && loan.tenure_months > 0
            ? Math.min(1, state.installmentsPaid / loan.tenure_months)
            : 0;
          const onSwipeDelete = () => handleLongPress(loan);
          return (
            <SwipeableRow key={loan.id} F={F} onRightAction={onSwipeDelete}>
              <TouchableOpacity
                onLongPress={() => handleLongPress(loan)}
                onPress={() => navigation.navigate('EditEMI', { id: loan.id })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Edit EMI ${loan.name}`}
                style={{ backgroundColor: F.surface, borderRadius: 18,
                  padding: 14, marginBottom: 10, flexDirection: 'row',
                  alignItems: 'center', gap: 12,
                  borderWidth: 1, borderColor: F.line }}>
                <View style={{ width: 42, height: 42, borderRadius: 13,
                  backgroundColor: loan.color || F.cream,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{loan.icon || '🏦'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
                    {loan.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    {loan.lender || 'No lender set'}
                    {state.ready && ` · ${loan.annual_rate_pct}% × ${loan.tenure_months}mo`}
                  </Text>
                  {state.ready && (
                    <>
                      <Text style={{ fontSize: 11, color: F.ink2, marginTop: 4 }}>
                        {state.installmentsPaid} of {loan.tenure_months} paid
                        {paidCount > 0 && ` · ${paidCount} linked`}
                        {' · '}{fmt(sym, state.outstandingPrincipal)} left
                      </Text>
                      <ProgressBar pct={pct} F={F}/>
                    </>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>
                    {fmt(sym, state.ready ? state.emiAmount : 0)}
                  </Text>
                  {state.ready && state.nextDueDate && (
                    <Text style={{ fontSize: 10, color: F.ink3 }}>
                      next {state.nextDueDate}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditEMI')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add EMI"
        style={{
          position: 'absolute', right: 22, bottom: insets.bottom + 28,
          width: 56, height: 56, borderRadius: 28, backgroundColor: F.coral,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: F.coral, shadowOpacity: 0.45, shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 }, elevation: 10,
        }}>
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(EMI);
