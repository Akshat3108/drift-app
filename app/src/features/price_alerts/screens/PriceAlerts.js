// 7.8 — Price alerts list screen.
//
// Hero: count of active alerts. Per-alert rows: 📈 + display_name + threshold
// summary ("over ₹X" / "+Y% from ₹Z" / both) + a small fired-recently badge.
// Tap → EditPriceAlert; long-press → soft-delete with Undo. FAB → EditPriceAlert.

import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { usePriceAlerts } from '@features/price_alerts/context';
import { useSettings } from '@features/profile/settings.context';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function thresholdLine(alert, sym) {
  const parts = [];
  if (alert.ceiling_price != null) parts.push(`over ${fmt(sym, alert.ceiling_price)}`);
  if (alert.jump_pct != null) {
    const base = alert.baseline_price != null ? ` from ${fmt(sym, alert.baseline_price)}` : '';
    parts.push(`+${Math.round(Number(alert.jump_pct))}%${base}`);
  }
  if (!parts.length) return 'No threshold set yet';
  return parts.join(' · ');
}

function PriceAlerts({ navigation }) {
  const { F } = useTheme();
  const { alerts, removeAlert, restoreAlert } = usePriceAlerts();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const activeCount = useMemo(
    () => alerts.filter(a => a.enabled).length,
    [alerts]
  );

  const onDelete = useCallback(async (alert) => {
    try {
      await removeAlert(alert.id);
      toast(`Deleted: ${alert.display_name}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreAlert(alert.id); }
          catch (err) {
            logError('price_alerts:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('price_alerts:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removeAlert, restoreAlert, toast]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Price watchlist</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {activeCount}
          <Text style={{ fontSize: 18, color: F.ink2 }}> active</Text>
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 20 }}>
          {alerts.length} watched item{alerts.length === 1 ? '' : 's'} · alerts fire on scan
        </Text>

        {alerts.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🔔</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No price alerts yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to watch a tracked item, or use the bell on an Item-trend screen.
            </Text>
          </View>
        )}

        {alerts.map((alert) => {
          const recentlyFired = alert.last_fired_at != null;
          return (
            <SwipeableRow key={alert.id} F={F} onRightAction={() => onDelete(alert)}>
              <TouchableOpacity
                onLongPress={() => onDelete(alert)}
                onPress={() => navigation.navigate('EditPriceAlert', { id: alert.id })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Edit price alert ${alert.display_name}`}
                style={{ backgroundColor: F.surface, borderRadius: 18,
                  padding: 14, marginBottom: 10, flexDirection: 'row',
                  alignItems: 'center', gap: 12,
                  borderWidth: 1, borderColor: F.line,
                  opacity: alert.enabled ? 1 : 0.55 }}>
                <View style={{ width: 42, height: 42, borderRadius: 13,
                  backgroundColor: F.cream,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>📈</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
                    {alert.display_name}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                    {thresholdLine(alert, sym)}
                  </Text>
                  {recentlyFired && (
                    <Text style={{ fontSize: 11, color: F.coral, marginTop: 4 }}>
                      🔔 fired at {fmt(sym, alert.last_fired_price)}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {alert.current_unit_price != null && (
                    <Text style={{ fontSize: 14, color: F.ink2 }}>
                      {fmt(sym, alert.current_unit_price)}
                    </Text>
                  )}
                  {!alert.enabled && (
                    <Text style={{ fontSize: 10, color: F.ink3 }}>paused</Text>
                  )}
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditPriceAlert')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add price alert"
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

export default React.memo(PriceAlerts);
