// 7.12 — Utilities list screen.
//
// Hero: total billed across all accounts in last 12 months + account count.
// Per-account row: icon + name + provider + last-bill amount + last-period-end.

import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useUtilities } from '@features/utilities/context';
import { useSettings } from '@features/profile/settings.context';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function Utilities({ navigation }) {
  const { F } = useTheme();
  const { accounts, aggregates, removeAccount, restoreAccount } = useUtilities();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const totals = useMemo(() => {
    let year = 0;
    let billCount = 0;
    for (const acc of accounts) {
      const agg = aggregates.get(acc.id);
      year += Number(agg?.year_total) || 0;
      billCount += Number(agg?.bill_count) || 0;
    }
    return { year, billCount };
  }, [accounts, aggregates]);

  const onDelete = useCallback(async (acc) => {
    try {
      await removeAccount(acc.id);
      toast(`Removed: ${acc.name}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreAccount(acc.id); }
          catch (err) {
            logError('utilities:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('utilities:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removeAccount, restoreAccount, toast]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Utilities billed (12 mo)</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {fmt(sym, totals.year)}
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 20 }}>
          {accounts.length} account{accounts.length === 1 ? '' : 's'}
          {totals.billCount > 0 && ` · ${totals.billCount} bill${totals.billCount === 1 ? '' : 's'} logged`}
        </Text>

        {accounts.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>💡</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No utilities yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to track electricity, gas, internet, mobile, or any recurring utility.
            </Text>
          </View>
        )}

        {accounts.map((acc) => {
          const agg = aggregates.get(acc.id);
          return (
            <SwipeableRow key={acc.id} F={F} onRightAction={() => onDelete(acc)}>
              <TouchableOpacity
                onLongPress={() => onDelete(acc)}
                onPress={() => navigation.navigate('UtilityDetail', { id: acc.id })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Open ${acc.name}`}
                style={{ backgroundColor: F.surface, borderRadius: 18,
                  padding: 14, marginBottom: 10, flexDirection: 'row',
                  alignItems: 'center', gap: 12,
                  borderWidth: 1, borderColor: F.line }}>
                <View style={{ width: 42, height: 42, borderRadius: 13,
                  backgroundColor: acc.color || F.cream,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{acc.icon || '💡'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
                    {acc.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                    {acc.provider || acc.kind}
                    {agg?.bill_count > 0 && ` · ${agg.bill_count} bill${agg.bill_count === 1 ? '' : 's'}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
                    {agg?.last_total != null ? fmt(sym, agg.last_total) : '—'}
                  </Text>
                  <Text style={{ fontSize: 10, color: F.ink3 }}>
                    {agg?.last_period_end ? `to ${agg.last_period_end}` : 'no bills yet'}
                  </Text>
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditUtility')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add utility"
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

export default React.memo(Utilities);
