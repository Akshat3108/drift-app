// 7.6 — VehicleDetail: per-vehicle fill-up history.
//
// Hero card: this-month spend, last fill-up date, last odometer, current
// mileage (kmpl) computed from the latest two full-tank fills. FlatList of
// fill-ups descending by fill_date. Tap row → EditFillup; FAB → EditFillup
// (create flow, pre-fills vehicle id); long-press / swipe → soft-delete.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
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

function HeroStat({ F, label, value }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 10, color: F.ink3, letterSpacing: 1, fontWeight: '700' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 16, color: F.ink, fontWeight: '500', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function VehicleDetail({ route, navigation }) {
  const { F } = useTheme();
  const id = route?.params?.id;
  const { vehicles, listByVehicle, mileageWindow,
          removeFillup, restoreFillup } = useFuel();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const vehicle = useMemo(() => vehicles.find(v => v.id === id), [vehicles, id]);
  const [fillups, setFillups] = useState([]);
  const [mileage, setMileage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (id == null) return;
    const [list, mw] = await Promise.all([
      listByVehicle(id),
      mileageWindow(id),
    ]);
    setFillups(list);
    setMileage(mw);
  }, [id, listByVehicle, mileageWindow]);

  useEffect(() => { refresh(); }, [refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); }
    catch (err) { logError('vehicledetail:refresh', err); }
    finally { setRefreshing(false); }
  }, [refresh]);

  const handleDelete = useCallback(async (fillup) => {
    try {
      await removeFillup(fillup.id);
      await refresh();
      toast('Fill-up deleted', {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreFillup(fillup.id); await refresh(); }
          catch (err) {
            logError('vehicledetail:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('vehicledetail:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removeFillup, restoreFillup, refresh, toast]);

  if (!vehicle) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: F.ink2 }}>Vehicle not found.</Text>
      </View>
    );
  }

  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonthSpend = fillups
    .filter(f => f.fill_date?.slice(0, 7) === thisMonthKey)
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const lastFillup = fillups[0];

  const renderItem = ({ item }) => {
    const onSwipeDelete = () => handleDelete(item);
    return (
      <SwipeableRow F={F} onRightAction={onSwipeDelete}>
        <TouchableOpacity
          onLongPress={() => handleDelete(item)}
          onPress={() => navigation.navigate('EditFillup',
            { id: item.id, vehicleId: vehicle.id })}
          activeOpacity={0.85}
          style={{ backgroundColor: F.surface, borderRadius: 14,
            padding: 12, marginHorizontal: 20, marginBottom: 8,
            borderWidth: 1, borderColor: F.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: F.ink }}>
                {fmtDate(item.fill_date)}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                {item.liters.toFixed(2)} L
                {item.rate_per_l != null && ` · ${fmt(sym, item.rate_per_l)}/L`}
                {item.fuel_type && ` · ${item.fuel_type}`}
                {item.is_full_tank ? '' : ' · partial'}
                {item.odometer_km != null && ` · ${Math.round(item.odometer_km)} km`}
              </Text>
            </View>
            <Text style={{ fontSize: 15, color: F.ink, fontWeight: '600' }}>
              {fmt(sym, item.amount)}
            </Text>
          </View>
        </TouchableOpacity>
      </SwipeableRow>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <FlatList
        data={fillups}
        keyExtractor={(f) => String(f.id)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>
        }
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 120 }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={{ width: 56, height: 56, borderRadius: 18,
                backgroundColor: vehicle.color || F.cream,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 28 }}>{vehicle.icon || '🚗'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, color: F.ink, fontWeight: '600' }}>
                  {vehicle.name}
                </Text>
                <Text style={{ fontSize: 12, color: F.ink3 }}>
                  {vehicle.type[0].toUpperCase() + vehicle.type.slice(1)}
                  {' · '}{vehicle.fuel_type}
                  {vehicle.registration_number ? ` · ${vehicle.registration_number}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('EditVehicle', { id: vehicle.id })}
                accessibilityRole="button" accessibilityLabel="Edit vehicle"
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                  borderWidth: 1, borderColor: F.line, backgroundColor: F.surface }}>
                <Text style={{ fontSize: 12, color: F.ink2, fontWeight: '600' }}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: F.surface, padding: 14, borderRadius: 16,
              borderWidth: 1, borderColor: F.line, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <HeroStat F={F} label="THIS MONTH" value={fmt(sym, thisMonthSpend)}/>
                <HeroStat F={F} label="LAST FILL"
                  value={lastFillup ? fmtDate(lastFillup.fill_date) : '—'}/>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <HeroStat F={F} label="ODOMETER"
                  value={lastFillup?.odometer_km != null
                    ? `${Math.round(lastFillup.odometer_km)} km` : '—'}/>
                <HeroStat F={F} label="MILEAGE"
                  value={mileage ? `${mileage.kmpl} km/L` : '—'}/>
              </View>
            </View>

            <Text style={{ fontSize: 11, color: F.ink3, letterSpacing: 1, fontWeight: '700',
              marginTop: 6, marginLeft: 4 }}>
              FILL-UP HISTORY
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 40, marginHorizontal: 20,
            backgroundColor: F.surface, borderRadius: 20,
            borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>⛽</Text>
            <Text style={{ fontSize: 14, color: F.ink2 }}>No fill-ups yet</Text>
            <Text style={{ fontSize: 12, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Scan a fuel receipt or tap + to log one manually.
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        onPress={() => navigation.navigate('EditFillup', { vehicleId: vehicle.id })}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add fill-up"
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

export default React.memo(VehicleDetail);
