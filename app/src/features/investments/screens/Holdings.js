// PS-10 — Holdings list screen.
//
// Hero card: portfolio market value + cost basis + unrealised gain/loss.
// Per-holding rows: kind chip, label, units × NAV computed value + gain pct.
// Tap row → HoldingDetail (NAV trajectory + returns); long-press → soft-delete with Undo.
// FAB → EditHolding (create flow).

import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useInvestments } from '@features/investments/context';
import { useSettings } from '@features/profile/settings.context';
import { KIND_META } from '@features/investments/repo';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function fmtAmount(sym, n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '−' : '';
  return `${sign}${sym}${Math.abs(v).toLocaleString('en-IN')}`;
}

function daysSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function Holdings({ navigation }) {
  const { F } = useTheme();
  const { holdings, totals, removeHolding, restoreHolding } = useInvestments();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const gainPct = totals.costBasis > 0
    ? (totals.gain / totals.costBasis) * 100
    : 0;
  const gainColor = totals.gain >= 0 ? F.sageD || '#3a8755' : F.coral;
  const oldestDays = daysSince(totals.oldestUpdate);

  const handleLongPress = useCallback(async (h) => {
    try {
      await removeHolding(h.id);
      toast(`Deleted: ${h.label}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreHolding(h.id); }
          catch (err) {
            logError('holdings:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('holdings:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removeHolding, restoreHolding, toast]);

  const rows = useMemo(() => holdings.map(h => {
    const meta = KIND_META[h.kind] || KIND_META.other;
    const stale = daysSince(h.last_updated);
    const itemGainPct = h.cost_basis > 0 ? (h.gain / h.cost_basis) * 100 : 0;
    return { h, meta, stale, itemGainPct };
  }), [holdings]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Portfolio value</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {fmtAmount(sym, totals.marketValue)}
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 20 }}>
          {totals.count} holding{totals.count === 1 ? '' : 's'} ·{' '}
          <Text style={{ color: gainColor }}>
            {totals.gain >= 0 ? '+' : ''}{fmtAmount(sym, totals.gain)}
            {' '}({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
          </Text>
        </Text>

        {oldestDays != null && oldestDays > 25 && (
          <View style={{ backgroundColor: F.cream, borderRadius: 12, padding: 12,
            marginBottom: 16, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 12, color: F.ink2 }}>
              📅 Oldest NAV update is {oldestDays} days ago. Refresh the
              market values below for an accurate net-worth view.
            </Text>
          </View>
        )}

        {holdings.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>📈</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No holdings yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Track mutual funds, equities, gold, FDs, NPS, PPF — anything
              outside your bank balances.
            </Text>
          </View>
        )}

        {rows.map(({ h, meta, stale, itemGainPct }) => (
          <TouchableOpacity
            key={h.id}
            onLongPress={() => handleLongPress(h)}
            onPress={() => navigation.navigate('HoldingDetail', { id: h.id })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`View holding ${h.label}`}
            style={{ backgroundColor: F.surface, borderRadius: 18,
              padding: 14, marginBottom: 10, flexDirection: 'row',
              alignItems: 'center', gap: 12,
              borderWidth: 1, borderColor: F.line }}>
            <View style={{ width: 42, height: 42, borderRadius: 13,
              backgroundColor: h.color || F.cream,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>{h.icon || meta.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
                {h.label}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3 }}>
                {meta.label} · {Number(h.units).toLocaleString('en-IN')} {meta.unitLabel}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>
                NAV {fmtAmount(sym, h.current_nav)}
                {stale != null && ` · updated ${stale}d ago`}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>
                {fmtAmount(sym, h.current_value)}
              </Text>
              <Text style={{ fontSize: 11, color: h.gain >= 0 ? gainColor : F.coral }}>
                {h.gain >= 0 ? '+' : ''}{itemGainPct.toFixed(1)}%
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditHolding')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add holding"
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

export default React.memo(Holdings);
