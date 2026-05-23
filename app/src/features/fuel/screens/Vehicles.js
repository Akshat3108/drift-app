// 7.6 — Vehicles list screen.
//
// Hero card: total this-month fuel spend across all vehicles + vehicle count.
// Per-vehicle row: icon, name, registration sub-line, this-month spend, last
// fill-up date. Tap → VehicleDetail; long-press / swipe → soft-delete with
// Undo. FAB → EditVehicle (create flow).

import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useFuel } from '@features/fuel/context';
import { useSettings } from '@features/profile/settings.context';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function fmtDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined,
    { day: 'numeric', month: 'short', year: 'numeric' });
}

function Vehicles({ navigation }) {
  const { F } = useTheme();
  const { vehicles, aggregates, removeVehicle, restoreVehicle } = useFuel();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const totalThisMonth = useMemo(() => {
    let s = 0;
    for (const a of Object.values(aggregates || {})) s += Number(a.this_month_spend) || 0;
    return s;
  }, [aggregates]);

  const handleDelete = useCallback(async (vehicle) => {
    try {
      await removeVehicle(vehicle.id);
      toast(`Deleted: ${vehicle.name}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreVehicle(vehicle.id); }
          catch (err) {
            logError('vehicles:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('vehicles:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removeVehicle, restoreVehicle, toast]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}>

        <Text style={{ fontSize: 13, color: F.ink2 }}>This month's fuel</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {fmt(sym, totalThisMonth)}
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 20 }}>
          {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'} tracked
        </Text>

        {vehicles.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🚗</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No vehicles yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to add a car, bike, or scooter. Fuel receipts you scan
              can then be tracked per vehicle.
            </Text>
          </View>
        )}

        {vehicles.map((v) => {
          const a = aggregates?.[v.id] || {};
          const onSwipeDelete = () => handleDelete(v);
          return (
            <SwipeableRow key={v.id} F={F} onRightAction={onSwipeDelete}>
              <TouchableOpacity
                onLongPress={() => handleDelete(v)}
                onPress={() => navigation.navigate('VehicleDetail', { id: v.id })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Open ${v.name}`}
                style={{ backgroundColor: F.surface, borderRadius: 18,
                  padding: 14, marginBottom: 10, flexDirection: 'row',
                  alignItems: 'center', gap: 12,
                  borderWidth: 1, borderColor: F.line }}>
                <View style={{ width: 42, height: 42, borderRadius: 13,
                  backgroundColor: v.color || F.cream,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{v.icon || '🚗'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
                    {v.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    {v.registration_number || `${v.type} · ${v.fuel_type}`}
                    {a.last_fill_date ? ` · last ${fmtDate(a.last_fill_date)}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
                    {fmt(sym, a.this_month_spend || 0)}
                  </Text>
                  <Text style={{ fontSize: 10, color: F.ink3 }}>
                    {a.count || 0} fill-up{(a.count || 0) === 1 ? '' : 's'}
                  </Text>
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditVehicle')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add vehicle"
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

export default React.memo(Vehicles);
