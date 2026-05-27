import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import TripChip from '@features/travel/components/TripChip';
import { CURRENCIES } from '@core/domain/currencies';
import { daysUntil } from '@core/utils/format';

function tripLengthDays(start, end) {
  if (!start || !end) return null;
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1);
}

function Travel({ navigation }) {
  const { F, sym, trips } = useApp();
  const insets = useSafeAreaInsets();
  const sorted = trips.slice().sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  const [tripIdx, setTripIdx] = useState(0);
  const trip = sorted[tripIdx];

  if (sorted.length === 0) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <View style={{ alignItems: 'center', padding: 40, marginTop: 60 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>✈️</Text>
          <Text style={{ fontSize: 18, color: F.ink, fontWeight: '500' }}>No trips yet</Text>
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 6, textAlign: 'center' }}>
            Plan a trip to track its budget and currency conversions offline.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('EditTrip')}
            style={{ marginTop: 24, backgroundColor: F.coral, borderRadius: 12,
              paddingVertical: 12, paddingHorizontal: 24 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Plan a trip</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const homeSym = CURRENCIES[trip.home_currency]?.symbol || sym;
  const destSym = CURRENCIES[trip.dest_currency]?.symbol || '?';
  const days = tripLengthDays(trip.start_date, trip.end_date);
  const perDay = days && trip.budget ? trip.budget / days : null;

  // 8.3 — stable per-chip callback. Receives trip id; we resolve the index
  // here so TripChip stays parameter-stable across selection toggles.
  const onChipPress = useCallback((tripId) => {
    const idx = sorted.findIndex((t) => t.id === tripId);
    if (idx >= 0) setTripIdx(idx);
  }, [sorted]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
      {sorted.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 12, gap: 8 }}>
          {sorted.map((t, i) => (
            <TripChip
              key={t.id}
              trip={t}
              F={F}
              isSelected={i === tripIdx}
              onPress={onChipPress}
            />
          ))}
        </ScrollView>
      )}

      <TouchableOpacity
        onPress={() => navigation.navigate('TripDetail', { tripId: trip.id })}
        activeOpacity={0.9}
        style={{ marginTop: 16, borderRadius: 26, padding: 24, marginBottom: 20,
          backgroundColor: '#e85d44' }}
      >
        {/* PS-07 — edit chevron in the top-right preserves the EditTrip path. */}
        <TouchableOpacity
          onPress={() => navigation.navigate('EditTrip', { id: trip.id })}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Edit trip"
          style={{ position: 'absolute', top: 14, right: 14,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99,
            backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>✏️ edit</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '700',
          letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          ✈️ {(() => { const d = daysUntil(trip.start_date); return d === null ? 'TRIP' : d < 0 ? 'IN PROGRESS' : d === 0 ? 'TODAY' : `IN ${d} DAYS`; })()}
        </Text>
        <Text style={{ fontSize: 30, color: '#fff', fontStyle: 'italic' }}>
          {trip.destination || trip.name}
        </Text>
        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>
          {trip.start_date || '—'} → {trip.end_date || '—'}{days ? ` · ${days} days` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 20 }}>
          {[
            ['Budget',  trip.budget ? `${homeSym}${trip.budget.toLocaleString()}` : '—'],
            ['Per day', perDay ? `${homeSym}${perDay.toFixed(0)}` : '—'],
            ['Dest',    trip.dest_currency],
          ].map(([l, v]) => (
            <View key={l}>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{l}</Text>
              <Text style={{ fontSize: 20, color: '#fff' }}>{v}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 18, textAlign: 'right' }}>
          tap for details
        </Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 18, color: F.ink, marginBottom: 12 }}>Currency</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1,
        borderColor: F.line, padding: 16, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: F.cream,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, color: F.coral }}>{homeSym}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>Home · {trip.home_currency}</Text>
            <Text style={{ fontSize: 12, color: F.ink3 }}>Your default currency</Text>
          </View>
          {trip.budget > 0 && (
            <Text style={{ fontSize: 16, color: F.ink }}>{homeSym}{trip.budget.toLocaleString()}</Text>
          )}
        </View>
        <View style={{ height: 1, backgroundColor: F.line, marginBottom: 12 }}/>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: F.coral,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, color: '#fff' }}>{destSym}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>Destination · {trip.dest_currency}</Text>
            <Text style={{ fontSize: 12, color: F.ink3 }}>1 {trip.home_currency} = {trip.dest_rate} {trip.dest_currency}</Text>
          </View>
          {trip.budget > 0 && (
            <Text style={{ fontSize: 16, color: F.ink }}>
              {destSym}{(trip.budget * trip.dest_rate).toLocaleString()}
            </Text>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontSize: 18, color: F.ink }}>Breakdown</Text>
        <TouchableOpacity onPress={() => navigation.navigate('EditTrip', { id: trip.id })}>
          <Text style={{ fontSize: 12, color: F.coral, fontWeight: '600' }}>edit categories</Text>
        </TouchableOpacity>
      </View>

      {(!trip.categories || trip.categories.length === 0) ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24,
          borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: F.ink3 }}>No categories yet — add them when editing.</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {trip.categories.map(c => {
            const pct = trip.budget > 0 ? (c.amount / trip.budget) * 100 : 0;
            return (
              <View key={c.id} style={{ width: '47%', backgroundColor: F.surface, borderRadius: 16, padding: 14,
                borderWidth: 1, borderColor: F.line }}>
                <Text style={{ fontSize: 13, color: F.ink2 }}>{c.emoji} {c.label}</Text>
                <Text style={{ fontSize: 18, color: F.ink, marginTop: 4 }}>{homeSym}{c.amount.toLocaleString()}</Text>
                {trip.budget > 0 && (
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: F.line, marginTop: 8 }}>
                    <View style={{ height: '100%', width: `${Math.min(100, pct)}%`, backgroundColor: F.coral, borderRadius: 2 }}/>
                  </View>
                )}
                {trip.budget > 0 && (
                  <Text style={{ fontSize: 10, color: F.ink3, marginTop: 4 }}>{pct.toFixed(0)}% of budget</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('EditTrip')}
        style={{ marginTop: 24, padding: 14, borderRadius: 14, backgroundColor: F.cream, alignItems: 'center' }}>
        <Text style={{ color: F.coral, fontWeight: '700' }}>+ Plan another trip</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default React.memo(Travel);
