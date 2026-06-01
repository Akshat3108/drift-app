// PS-31 — Holding detail: NAV trajectory + returns.
//
// PS-10 only ever showed the *current* NAV. This screen reads the
// holding_nav_history time-series (v55) and draws it with the shared TrendChart,
// plus a headline returns block (total return + annualised CAGR). Edit/Delete
// live behind the header so the list row can route here instead of straight to
// the edit form.

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useInvestments } from '@features/investments/context';
import { useSettings } from '@features/profile/settings.context';
import { KIND_META } from '@features/investments/repo';
import { holdingReturns } from '@features/investments/returns';
import TrendChart from '@components/charts/TrendChart';

const fmt = (n, sym) => `${sym}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const shortDay = (iso) => {
  // YYYY-MM-DD → "5 Jun" style short label for the x-axis.
  const d = new Date(String(iso).slice(0, 10));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
};

function HoldingDetail({ route, navigation }) {
  const { F } = useTheme();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();
  const { holdings, navHistory } = useInvestments();

  const id = route?.params?.id;
  const holding = useMemo(() => (holdings || []).find((h) => h.id === id), [holdings, id]);

  const [history, setHistory] = useState([]);
  const load = useCallback(async () => {
    if (id == null) return;
    try { setHistory(await navHistory(id)); } catch { setHistory([]); }
  }, [id, navHistory]);
  // Reload whenever the holding's NAV changes (e.g. after an edit returns here).
  useEffect(() => { load(); }, [load, holding?.current_nav]);

  const returns = useMemo(() => holdingReturns(holding, history), [holding, history]);
  const series = useMemo(
    () => (history || []).map((h) => ({ value: Number(h.nav) || 0, label: shortDay(h.recorded_at), key: String(h.id) })),
    [history],
  );

  if (!holding) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: F.ink2 }}>Holding not found.</Text>
      </View>
    );
  }

  const meta = KIND_META[holding.kind] || KIND_META.other;
  const gainPos = (returns?.gain ?? 0) >= 0;
  const gainColor = gainPos ? (F.sageD || '#3a8755') : F.coral;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      {/* Header card */}
      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Text style={{ fontSize: 28 }}>{holding.icon || meta.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, color: F.ink, fontWeight: '500' }} numberOfLines={1}>{holding.label}</Text>
              <Text style={{ fontSize: 12, color: F.ink3 }}>{meta.label}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditHolding', { id: holding.id })}
            hitSlop={10}
            accessibilityRole="button" accessibilityLabel={`Edit ${holding.label}`}
            style={{ backgroundColor: F.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}>
            <Text style={{ fontSize: 12, color: F.ink, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 13, color: F.ink2, marginTop: 14 }}>Market value</Text>
        <Text style={{ fontSize: 40, color: F.ink, fontWeight: '400', lineHeight: 46, marginTop: 2 }}>
          {fmt(returns?.current_value ?? (holding.units * holding.current_nav), sym)}
        </Text>
        {returns && (
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 2 }}>
            Cost {fmt(returns.cost_basis, sym)} ·{' '}
            <Text style={{ color: gainColor, fontWeight: '600' }}>
              {gainPos ? '+' : '−'}{fmt(Math.abs(returns.gain), sym)} ({returns.absolute >= 0 ? '+' : ''}{(returns.absolute * 100).toFixed(1)}%)
            </Text>
          </Text>
        )}
      </View>

      {/* Returns block */}
      {returns && (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <View style={{ flex: 1, backgroundColor: F.surface, borderRadius: 16, borderWidth: 1, borderColor: F.line, padding: 14 }}>
            <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>TOTAL RETURN</Text>
            <Text style={{ fontSize: 22, color: gainColor, fontWeight: '500', marginTop: 4 }}>
              {returns.absolute >= 0 ? '+' : ''}{(returns.absolute * 100).toFixed(1)}%
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: F.surface, borderRadius: 16, borderWidth: 1, borderColor: F.line, padding: 14 }}>
            <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>ANNUALISED</Text>
            <Text style={{ fontSize: 22, color: returns.annualised == null ? F.ink3 : gainColor, fontWeight: '500', marginTop: 4 }}>
              {returns.annualised == null
                ? '—'
                : `${returns.annualised >= 0 ? '+' : ''}${(returns.annualised * 100).toFixed(1)}%`}
            </Text>
            <Text style={{ fontSize: 10, color: F.ink3, marginTop: 2 }}>
              {returns.annualised == null ? 'held < 30 days' : `CAGR · ${returns.years.toFixed(1)} yr`}
            </Text>
          </View>
        </View>
      )}

      {/* NAV trajectory */}
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, padding: 16 }}>
        {series.length >= 2 ? (
          <TrendChart
            chartId={`holding_nav_${holding.id}`}
            title="NAV over time"
            series={series}
            allow={['line', 'area', 'dot']}
            defaultType="line"
            color={holding.color || F.coral}
            zeroBased={false}
            height={150}
            formatValue={(v) => fmt(v, sym)}
          />
        ) : (
          <>
            <Text style={{ fontSize: 13, color: F.ink2, fontWeight: '600', marginBottom: 6 }}>NAV over time</Text>
            <Text style={{ fontSize: 12, color: F.ink3 }}>
              Update this holding's NAV over time and the return trajectory will plot here.
            </Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default React.memo(HoldingDetail);
