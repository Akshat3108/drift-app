// PS-07 — Trip detail.
//
// Renders for `route.params.tripId`:
//   1. Trip hero (destination + dates + days remaining).
//   2. Budget vs actual strip (home_currency; `actual = Σ e.amount × (e.fx_rate || 1)`).
//   3. Currency converter strip when dest_currency ≠ home_currency.
//   4. Per-day spend bar chart via react-native-svg (one bar per trip day).
//   5. Expenses list filtered by trip_id (tap → Detail; long-press would
//      enter AllExpenses select mode but we keep that flow in AllExpenses).
//   6. Footer CTA "+ Tag more expenses" → AllExpenses with the tagToTripId
//      hint route param (PS-07 wiring on the AllExpenses side).
//
// Pure helpers `tripDaysRange(start, end)` and `dayBucketize(expenses, start, end)`
// are exported for /tmp/ validation.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { expenses as expRepo } from '@features/expenses/repo';
import { CURRENCIES } from '@core/domain/currencies';
import { potBg } from '../../../theme';
import TrendChart from '@components/charts/TrendChart';

// Enumerate every date string (YYYY-MM-DD) between start and end inclusive.
// Returns [] when start/end are missing or end < start. Pure / null-safe.
export function tripDaysRange(start, end) {
  if (!start || !end) return [];
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return [];
  const days = [];
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push(`${yr}-${mo}-${dd}`);
  }
  return days;
}

// Bucketize expenses into a per-day series. Each expense's home-currency
// equivalent = e.amount × (e.fx_rate || 1). Days with no expenses get
// total=0 so the chart always has a stable count of bars.
export function dayBucketize(expenses, startDate, endDate) {
  const days = tripDaysRange(startDate, endDate);
  if (days.length === 0) return [];
  const total = new Map(days.map((d) => [d, 0]));
  for (const e of expenses || []) {
    const date = (e.expense_date || '').slice(0, 10);
    if (!total.has(date)) continue;
    const home = (Number(e.amount) || 0) * (Number(e.fx_rate) || 1);
    total.set(date, total.get(date) + home);
  }
  return days.map((d) => ({ date: d, total: total.get(d) || 0 }));
}

function fmtMoney(sym, n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1_00_000) return `${v < 0 ? '−' : ''}${sym}${(abs / 1_00_000).toFixed(1)}L`;
  return `${v < 0 ? '−' : ''}${sym}${abs.toLocaleString('en-IN')}`;
}

function fmtShortDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function TripDetail({ route, navigation }) {
  const { F, sym, trips, pots } = useApp();
  const insets = useSafeAreaInsets();
  const tripId = route?.params?.tripId;
  const trip = (trips || []).find((t) => t.id === tripId);
  const [tripExpenses, setTripExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!tripId) { setLoading(false); return; }
    (async () => {
      try {
        const rows = await expRepo.list({
          criteria: { tripIds: [tripId] },
          limit: 500,
        });
        if (cancelled) return;
        setTripExpenses(rows || []);
      } catch { /* swallow */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tripId]);

  const homeSym = CURRENCIES[trip?.home_currency]?.symbol || sym;
  const destSym = CURRENCIES[trip?.dest_currency]?.symbol || '?';
  const sameCurrency = !trip || trip.home_currency === trip.dest_currency || (trip.dest_rate || 1) === 1;

  const actualHome = useMemo(() =>
    tripExpenses.reduce((s, e) => s + (Number(e.amount) || 0) * (Number(e.fx_rate) || 1), 0),
    [tripExpenses],
  );
  const budgetHome = Number(trip?.budget) || 0;
  const overrun = budgetHome > 0 && actualHome > budgetHome;
  const progressFrac = budgetHome > 0 ? Math.min(1, actualHome / budgetHome) : 0;

  const buckets = useMemo(
    () => trip ? dayBucketize(tripExpenses, trip.start_date, trip.end_date) : [],
    [trip, tripExpenses],
  );

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, color: F.ink, fontWeight: '600' }}>Trip not found</Text>
        <Text style={{ fontSize: 12, color: F.ink3, marginTop: 6 }}>
          It may have been deleted. Pull-to-refresh on the Travel tab.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 60, paddingHorizontal: 16 }}
    >
      {/* Hero */}
      <View style={{ backgroundColor: F.coral, borderRadius: 22, padding: 18 }}>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          ✈️ Trip
        </Text>
        <Text style={{ fontSize: 24, color: '#fff', fontWeight: '700', marginTop: 4 }}>
          {trip.destination || trip.name}
        </Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>
          {fmtShortDate(trip.start_date)} → {fmtShortDate(trip.end_date)}
        </Text>
      </View>

      {/* Budget vs actual */}
      <View style={{ marginTop: 14, padding: 14, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Actual</Text>
            <Text style={{ fontSize: 22, color: overrun ? F.coral : F.ink, fontWeight: '700', marginTop: 2 }}>
              {fmtMoney(homeSym, actualHome)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Budget</Text>
            <Text style={{ fontSize: 22, color: F.ink2, fontWeight: '700', marginTop: 2 }}>
              {budgetHome > 0 ? fmtMoney(homeSym, budgetHome) : '—'}
            </Text>
          </View>
        </View>
        {budgetHome > 0 && (
          <>
            <View style={{ height: 6, backgroundColor: F.line, borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
              <View style={{ height: 6, width: `${progressFrac * 100}%`,
                backgroundColor: overrun ? F.coral : F.sageD, borderRadius: 3 }}/>
            </View>
            <Text style={{ fontSize: 11, color: overrun ? F.coral : F.ink3, marginTop: 6 }}>
              {overrun
                ? `Over budget by ${fmtMoney(homeSym, actualHome - budgetHome)}`
                : `${fmtMoney(homeSym, budgetHome - actualHome)} left in budget`}
            </Text>
          </>
        )}
      </View>

      {/* Currency converter strip */}
      {!sameCurrency && (
        <View style={{ marginTop: 14, padding: 14, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 11, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            Currency · 1 {trip.home_currency} = {trip.dest_rate} {trip.dest_currency}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: F.ink }}>
              {fmtMoney(homeSym, actualHome)} home
            </Text>
            <Text style={{ fontSize: 13, color: F.ink }}>
              ≈ {fmtMoney(destSym, actualHome * trip.dest_rate)} dest
            </Text>
          </View>
        </View>
      )}

      {/* Per-day bar chart */}
      {buckets.length > 0 && (
        <View style={{ marginTop: 14, padding: 12, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 11, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            Spend per day
          </Text>
          <TrendChart
            chartId="trip.daily"
            series={buckets.map((b) => ({ value: b.total, label: b.date.slice(8, 10), key: b.date }))}
            allow={['bar', 'line', 'area', 'dot']}
            defaultType="bar"
            height={150}
            color={F.coral}
            formatValue={(v) => fmtMoney(homeSym, v)}
          />
        </View>
      )}

      {/* Expense list */}
      <View style={{ marginTop: 14, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
        <Text style={{ fontSize: 11, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, padding: 12, paddingBottom: 2 }}>
          {tripExpenses.length} tagged spend{tripExpenses.length === 1 ? '' : 's'}
        </Text>
        {loading ? (
          <Text style={{ fontSize: 12, color: F.ink3, padding: 12 }}>Loading…</Text>
        ) : tripExpenses.length === 0 ? (
          <View style={{ padding: 18, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: F.ink2, textAlign: 'center' }}>
              No expenses tagged to this trip yet.
            </Text>
          </View>
        ) : (
          tripExpenses.map((e, i) => {
            const pot = (pots || []).find((p) => p.id === e.category_id);
            return (
              <TouchableOpacity
                key={e.id}
                onPress={() => navigation.navigate('Detail', { id: e.id })}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderTopWidth: 1, borderTopColor: F.line }}>
                <View style={{ width: 28, height: 28, borderRadius: 10,
                  backgroundColor: pot ? potBg(F, pot.color || 'cream') : F.cream,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14 }}>{pot?.emoji || '·'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: F.ink, fontWeight: '500' }} numberOfLines={1}>
                    {e.merchant || '—'}
                  </Text>
                  <Text style={{ fontSize: 10, color: F.ink3 }}>
                    {fmtShortDate(e.expense_date)}{pot ? ` · ${pot.label || pot.name}` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
                  {fmtMoney(homeSym, (Number(e.amount) || 0) * (Number(e.fx_rate) || 1))}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Footer CTA */}
      <TouchableOpacity
        onPress={() => navigation.navigate('AllExpenses', { tagToTripId: trip.id })}
        activeOpacity={0.85}
        style={{ marginTop: 16, backgroundColor: F.coral, borderRadius: 14,
          paddingVertical: 12, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
          + Tag more expenses
        </Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 10, color: F.ink3, marginTop: 14, textAlign: 'center' }}>
        Totals shown in {trip.home_currency} using each expense's stored FX rate.
      </Text>
    </ScrollView>
  );
}

export default React.memo(TripDetail);
