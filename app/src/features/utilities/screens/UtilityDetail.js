// 7.12 — UtilityDetail. Drill-in for one utility account.
//
// Hero: last bill total + period end + year total. Per-account trend chart
// (consumption + rate over last 12 months via two stacked Polylines, dual
// y-axis with the legend telling the user which is which). Bills history
// list below.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useUtilities } from '@features/utilities/context';
import { useSettings } from '@features/profile/settings.context';

let Svg = null, Polyline = null, Line = null, Circle = null, SvgText = null;
try {
  const mod = require('react-native-svg');
  Svg      = mod.Svg ?? mod.default;
  Polyline = mod.Polyline;
  Line     = mod.Line;
  Circle   = mod.Circle;
  SvgText  = mod.Text;
} catch (_) { /* dev shell — chart silently falls back to a numeric strip */ }

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 32;
const CHART_H  = 160;
const PAD = { top: 14, right: 14, bottom: 24, left: 14 };

function fmt(sym, n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

// Build the consumption + rate polylines. `series` is oldest→newest. Each
// polyline is scaled to its own min/max so they share the chart visually
// even though their units differ.
function chartGeometry(series) {
  if (!series || series.length < 2) return null;
  const usableW = CHART_W - PAD.left - PAD.right;
  const usableH = CHART_H - PAD.top - PAD.bottom;
  const units = series.map(r => Number(r.units_consumed) || 0).filter(v => v > 0);
  const rates = series.map(r => Number(r.rate_per_unit)  || 0).filter(v => v > 0);
  const unitsMax = units.length ? Math.max(...units) * 1.1 : 0;
  const ratesMax = rates.length ? Math.max(...rates) * 1.1 : 0;

  const stepX = series.length > 1 ? usableW / (series.length - 1) : 0;
  const pts = series.map((r, i) => ({
    x: PAD.left + i * stepX,
    yUnits: unitsMax > 0 && r.units_consumed > 0
      ? PAD.top + (1 - (r.units_consumed / unitsMax)) * usableH
      : null,
    yRate: ratesMax > 0 && r.rate_per_unit > 0
      ? PAD.top + (1 - (r.rate_per_unit / ratesMax)) * usableH
      : null,
  }));
  return { pts, unitsMax, ratesMax };
}

function UtilityDetail({ route, navigation }) {
  const { F } = useTheme();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();
  const { accounts, aggregates, billsForAccount, consumptionTrend } = useUtilities();

  const id = route?.params?.id;
  const account = useMemo(() => accounts.find(a => a.id === id), [accounts, id]);
  const agg = aggregates.get(id);

  const [bills, setBills] = useState([]);
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    if (id == null) return;
    let cancelled = false;
    (async () => {
      const [bs, tr] = await Promise.all([
        billsForAccount(id),
        consumptionTrend(id, { months: 12 }),
      ]);
      if (!cancelled) {
        setBills(bs);
        setTrend(tr);
      }
    })();
    return () => { cancelled = true; };
  }, [id, billsForAccount, consumptionTrend]);

  const geo = useMemo(() => chartGeometry(trend), [trend]);
  const hasUnits = geo?.unitsMax > 0;
  const hasRates = geo?.ratesMax > 0;

  if (!account) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: F.ink3 }}>Utility not found.</Text>
      </View>
    );
  }

  function polyPoints(pts, key) {
    return pts.filter(p => p[key] != null).map(p => `${p.x},${p[key]}`).join(' ');
  }

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 16 }}>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <View style={{ width: 56, height: 56, borderRadius: 14,
            backgroundColor: account.color || F.cream,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 26 }}>{account.icon || '💡'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>{account.name}</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 2 }}>
              {account.provider || account.kind}
              {account.account_number && ` · #${account.account_number}`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditUtility', { id: account.id })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Edit utility"
            style={{ padding: 8 }}>
            <Text style={{ fontSize: 14, color: F.coral }}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: F.cream, borderRadius: 22, padding: 18, marginBottom: 16 }}>
          <Text style={{ fontSize: 13, color: F.ink2 }}>Last bill</Text>
          <Text style={{ fontSize: 36, color: F.ink, fontWeight: '400', marginTop: 2 }}>
            {fmt(sym, agg?.last_total)}
          </Text>
          <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
            {agg?.last_period_end ? `Period ending ${agg.last_period_end}` : 'No bills logged yet'}
            {agg?.year_total > 0 && (
              <Text style={{ color: F.coral }}>  ·  {fmt(sym, agg.year_total)} in last 12 mo</Text>
            )}
          </Text>
        </View>

        <Text style={{ fontSize: 13, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>
          CONSUMPTION + RATE (12 MO)
        </Text>
        {trend.length < 2 ? (
          <View style={{ backgroundColor: F.surface, borderRadius: 14, padding: 18,
            borderWidth: 1, borderColor: F.line, alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: F.ink3 }}>
              Log 2+ bills with units + rate to see trends.
            </Text>
          </View>
        ) : (
          <View style={{ backgroundColor: F.surface, borderRadius: 14, padding: 8,
            borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
            {Svg && Polyline && geo ? (
              <Svg width={CHART_W - 16} height={CHART_H}>
                {hasUnits && (
                  <Polyline
                    points={polyPoints(geo.pts, 'yUnits')}
                    stroke={F.coral} strokeWidth="2" fill="none"/>
                )}
                {hasRates && (
                  <Polyline
                    points={polyPoints(geo.pts, 'yRate')}
                    stroke={F.sageD} strokeWidth="2" strokeDasharray="4 3" fill="none"/>
                )}
                {geo.pts.map((p, i) => (
                  hasUnits && p.yUnits != null
                    ? <Circle key={`u-${i}`} cx={p.x} cy={p.yUnits} r={3} fill={F.coral}/>
                    : null
                ))}
              </Svg>
            ) : (
              <Text style={{ fontSize: 12, color: F.ink3 }}>(install react-native-svg for chart)</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 8, paddingTop: 4 }}>
              {hasUnits && (
                <Text style={{ fontSize: 11, color: F.coral, fontWeight: '600' }}>
                  ━━ Consumption
                </Text>
              )}
              {hasRates && (
                <Text style={{ fontSize: 11, color: F.sageD, fontWeight: '600' }}>
                  ┅┅ Rate/unit
                </Text>
              )}
            </View>
          </View>
        )}

        <Text style={{ fontSize: 13, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>
          BILLS ({bills.length})
        </Text>
        {bills.length === 0 ? (
          <Text style={{ fontSize: 13, color: F.ink3, textAlign: 'center', padding: 16 }}>
            No bills yet — tap + to log the first one.
          </Text>
        ) : bills.map((b) => (
          <TouchableOpacity key={b.id}
            onPress={() => navigation.navigate('EditBill', { id: b.id })}
            activeOpacity={0.85}
            style={{ backgroundColor: F.surface, borderRadius: 14, padding: 14,
              flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8,
              borderWidth: 1, borderColor: F.line }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>
                {b.period_start} → {b.period_end}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                {b.units_consumed != null && b.rate_per_unit != null
                  ? `${b.units_consumed} units @ ${sym}${b.rate_per_unit}/unit`
                  : b.units_consumed != null
                    ? `${b.units_consumed} units`
                    : b.due_date ? `due ${b.due_date}` : '—'}
              </Text>
            </View>
            <Text style={{ fontSize: 15, color: F.ink, fontWeight: '600' }}>
              {fmt(sym, b.total)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditBill', { utility_account_id: id })}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Log bill"
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

export default React.memo(UtilityDetail);
