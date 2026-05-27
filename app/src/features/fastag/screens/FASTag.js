// PS-13 — FASTag accounts list.

import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useFastag } from '@features/fastag/context';
import { useFuel } from '@features/fuel/context';
import { useSettings } from '@features/profile/settings.context';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function FASTag({ navigation }) {
  const { F } = useTheme();
  const { accounts, ytdSpend, removeAccount, restoreAccount } = useFastag();
  const { vehicles } = useFuel();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const vehicleById = useMemo(() => {
    const m = {};
    for (const v of (vehicles || [])) m[v.id] = v;
    return m;
  }, [vehicles]);

  const totals = useMemo(() => {
    let balance = 0, ytd = 0;
    for (const a of accounts) balance += Number(a.current_balance) || 0;
    for (const r of Object.values(ytdSpend)) ytd += Number(r.total) || 0;
    return { balance, ytd };
  }, [accounts, ytdSpend]);

  const handleLongPress = useCallback(async (a) => {
    try {
      await removeAccount(a.id);
      toast(`Deleted: ${a.label}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreAccount(a.id); }
          catch (err) {
            logError('fastag:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('fastag:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removeAccount, restoreAccount, toast]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Wallet balance</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {fmt(sym, totals.balance)}
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 20 }}>
          {accounts.length} tag{accounts.length === 1 ? '' : 's'} ·{' '}
          <Text style={{ color: F.coral }}>{fmt(sym, totals.ytd)} YTD tolls</Text>
        </Text>

        {/* Import-from-CSV hint — uses the existing 7.15 CsvImport screen. */}
        {accounts.length > 0 && (
          <TouchableOpacity
            onPress={() => navigation.navigate('CsvImport')}
            activeOpacity={0.85}
            style={{ backgroundColor: F.cream, padding: 12, borderRadius: 14,
              flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Text style={{ fontSize: 20 }}>📥</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
                Import toll transactions
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3 }}>
                Download a statement from your FASTag portal · CSV import
              </Text>
            </View>
            <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
          </TouchableOpacity>
        )}

        {accounts.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🛣️</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No FASTags yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to register a FASTag and track tolls against it.
            </Text>
          </View>
        )}

        {accounts.map((a) => {
          const veh = a.vehicle_id ? vehicleById[a.vehicle_id] : null;
          const spend = ytdSpend?.[a.id] || { txns: 0, total: 0 };
          return (
            <TouchableOpacity
              key={a.id}
              onLongPress={() => handleLongPress(a)}
              onPress={() => navigation.navigate('EditFastag', { id: a.id })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Edit FASTag ${a.label}`}
              style={{ backgroundColor: F.surface, borderRadius: 18,
                padding: 14, marginBottom: 10, flexDirection: 'row',
                alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: F.line }}>
              <View style={{ width: 42, height: 42, borderRadius: 13,
                backgroundColor: a.color || F.cream,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{a.icon || '🛣️'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
                  {a.label}
                </Text>
                <Text style={{ fontSize: 11, color: F.ink3 }}>
                  {a.bank || 'Bank not set'}
                  {veh ? ` · ${veh.label || veh.registration_number}` : ''}
                </Text>
                <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>
                  {spend.txns} txns YTD · {fmt(sym, spend.total)}
                </Text>
              </View>
              <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>
                {fmt(sym, a.current_balance)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditFastag')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add FASTag"
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

export default React.memo(FASTag);
