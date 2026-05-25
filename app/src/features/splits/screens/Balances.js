// 7.9 — Balances screen. Per-person drill-in showing every expense they
// have a split on. Either opened with route.params.id (specific person) or
// no params (overview).

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { usePeople } from '@features/splits/context';
import { useSettings } from '@features/profile/settings.context';

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function Balances({ route, navigation }) {
  const { F } = useTheme();
  const { people, balances, expensesForPerson } = usePeople();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();

  const personId = route?.params?.id ?? null;
  const person = personId != null ? people.find(p => p.id === personId) : null;
  const balance = personId != null ? balances.find(b => b.id === personId) : null;

  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (personId == null) { setHistory([]); return; }
    let cancelled = false;
    (async () => {
      const rows = await expensesForPerson(personId, { limit: 100 });
      if (!cancelled) setHistory(rows || []);
    })();
    return () => { cancelled = true; };
  }, [personId, expensesForPerson]);

  // Overview mode — render per-person rollup as Balances "all people" view.
  if (personId == null) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 60, paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 24, color: F.ink, marginBottom: 16 }}>Balances</Text>
        {balances.map((b) => (
          <TouchableOpacity key={b.id}
            onPress={() => navigation.push('Balances', { id: b.id })}
            activeOpacity={0.85}
            style={{ backgroundColor: F.surface, borderRadius: 14, padding: 14,
              flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8,
              borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 20 }}>{b.emoji || '👤'}</Text>
            <Text style={{ flex: 1, fontSize: 14, color: F.ink }}>{b.name}</Text>
            <Text style={{ fontSize: 14, color: b.owed > 0 ? F.coral : F.ink2, fontWeight: '600' }}>
              {fmt(sym, b.owed)}
            </Text>
          </TouchableOpacity>
        ))}
        {balances.length === 0 && (
          <Text style={{ color: F.ink3, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
            No people yet.
          </Text>
        )}
      </ScrollView>
    );
  }

  if (!person) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: F.ink3 }}>Person not found.</Text>
      </View>
    );
  }

  const totalOwed = Number(balance?.owed) || 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 60, paddingHorizontal: 20 }}>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28,
          backgroundColor: person.color || F.cream,
          alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 26 }}>{person.emoji || '👤'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>{person.name}</Text>
          <Text style={{ fontSize: 13, color: F.ink3, marginTop: 2 }}>
            {fmt(sym, totalOwed)} owed to you
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('EditPerson', { id: person.id })}
          activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${person.name}`}
          style={{ padding: 8 }}>
          <Text style={{ fontSize: 14, color: F.coral }}>Edit</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 11, color: F.ink3, letterSpacing: 1, fontWeight: '700',
        marginBottom: 8 }}>SPLITS</Text>

      {history.length === 0 && (
        <Text style={{ color: F.ink3, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
          No splits with {person.name} yet.
        </Text>
      )}

      {history.map((row) => (
        <TouchableOpacity key={row.split_id}
          onPress={() => navigation.navigate('Detail', { id: row.id })}
          activeOpacity={0.85}
          style={{ backgroundColor: F.surface, borderRadius: 14, padding: 14,
            flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8,
            borderWidth: 1, borderColor: F.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>{row.merchant}</Text>
            <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
              {row.expense_date} · total {fmt(sym, row.expense_total)}
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: F.coral, fontWeight: '600' }}>
            {fmt(sym, row.share)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export default React.memo(Balances);
