// PS-11 — Insurance policy list screen.
//
// Hero: total monthly-equivalent premium + active count.
// Per-policy rows: icon, label, provider, next due chip, monthly-equiv amount.
// Tap → EditInsurance; long-press → soft-delete with Undo.
// FAB → EditInsurance (create flow).

import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useInsurance } from '@features/insurance/context';
import { useSettings } from '@features/profile/settings.context';
import { KIND_META, monthlyEquivalent, daysUntilDue } from '@features/insurance/repo';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function dueChip(F, days) {
  if (days == null) return { text: 'No due date set', color: F.ink3 };
  if (days < 0)  return { text: `Overdue by ${-days}d`, color: F.coral };
  if (days <= 7) return { text: `Due in ${days}d`, color: F.coral };
  if (days <= 30) return { text: `Due in ${days}d`, color: F.ink2 };
  return { text: `Due in ${days}d`, color: F.ink3 };
}

function Insurance({ navigation }) {
  const { F } = useTheme();
  const { policies, linkedCounts, removePolicy, restorePolicy } = useInsurance();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const totals = useMemo(() => {
    let monthly = 0;
    let totalSum = 0;
    for (const p of policies) {
      monthly += monthlyEquivalent(p);
      totalSum += Number(p.sum_assured) || 0;
    }
    return { monthly, totalSum };
  }, [policies]);

  const handleLongPress = useCallback(async (p) => {
    try {
      await removePolicy(p.id);
      toast(`Deleted: ${p.label}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restorePolicy(p.id); }
          catch (err) {
            logError('insurance:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('insurance:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removePolicy, restorePolicy, toast]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Monthly-equivalent premium</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {fmt(sym, totals.monthly)}<Text style={{ fontSize: 18, color: F.ink2 }}> /mo</Text>
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 20 }}>
          {policies.length} polic{policies.length === 1 ? 'y' : 'ies'}
          {totals.totalSum > 0 ? ` · ${fmt(sym, totals.totalSum)} sum assured` : ''}
        </Text>

        {policies.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🛡️</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No policies yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to add life, term, health, or vehicle insurance.
            </Text>
          </View>
        )}

        {policies.map((p) => {
          const meta = KIND_META[p.kind] || KIND_META.other;
          const days = daysUntilDue(p);
          const chip = dueChip(F, days);
          const linked = linkedCounts?.[p.id] || 0;
          const mEq = monthlyEquivalent(p);
          return (
            <TouchableOpacity
              key={p.id}
              onLongPress={() => handleLongPress(p)}
              onPress={() => navigation.navigate('EditInsurance', { id: p.id })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Edit insurance ${p.label}`}
              style={{ backgroundColor: F.surface, borderRadius: 18,
                padding: 14, marginBottom: 10, flexDirection: 'row',
                alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: F.line }}>
              <View style={{ width: 42, height: 42, borderRadius: 13,
                backgroundColor: p.color || F.cream,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{p.icon || meta.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
                  {p.label}
                </Text>
                <Text style={{ fontSize: 11, color: F.ink3 }}>
                  {meta.label}{p.provider ? ` · ${p.provider}` : ''}
                </Text>
                <Text style={{ fontSize: 11, color: chip.color, marginTop: 2 }}>
                  {chip.text}{linked > 0 ? ` · ${linked} paid` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>
                  {fmt(sym, p.premium_amount)}
                </Text>
                <Text style={{ fontSize: 10, color: F.ink3 }}>
                  ≈ {fmt(sym, mEq)}/mo
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditInsurance')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add insurance"
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

export default React.memo(Insurance);
