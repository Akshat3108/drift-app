// 7.9 — People list screen.
//
// Hero: count of live people + total owed to user. Per-person rows show
// emoji, name, owed-balance + split count. Tap row → Balances (drill-in)
// per person. FAB → EditPerson.

import React, { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { usePeople } from '@features/splits/context';
import { useSettings } from '@features/profile/settings.context';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function People({ navigation }) {
  const { F } = useTheme();
  const { people, balances, removePerson, restorePerson } = usePeople();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  // people slice owns identity; balances slice owns aggregate. Join in memory.
  const rows = useMemo(() => {
    const byId = new Map(balances.map(b => [b.id, b]));
    return people.map(p => ({
      ...p,
      owed: Number(byId.get(p.id)?.owed) || 0,
      split_count: Number(byId.get(p.id)?.split_count) || 0,
    }));
  }, [people, balances]);

  const totalOwed = useMemo(() => rows.reduce((s, r) => s + r.owed, 0), [rows]);

  const onDelete = useCallback(async (person) => {
    try {
      await removePerson(person.id);
      toast(`Removed: ${person.name}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restorePerson(person.id); }
          catch (err) {
            logError('people:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('people:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removePerson, restorePerson, toast]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Owed to you</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {fmt(sym, totalOwed)}
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 20 }}>
          {people.length} {people.length === 1 ? 'person' : 'people'}
          {totalOwed > 0 && ' · across all live splits'}
        </Text>

        {people.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>👥</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No people yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to add a friend / flatmate, then split an expense with them.
            </Text>
          </View>
        )}

        {rows.map((p) => (
          <SwipeableRow key={p.id} F={F} onRightAction={() => onDelete(p)}>
            <TouchableOpacity
              onLongPress={() => onDelete(p)}
              onPress={() => navigation.navigate('Balances', { id: p.id })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Open balance for ${p.name}`}
              style={{ backgroundColor: F.surface, borderRadius: 18,
                padding: 14, marginBottom: 10, flexDirection: 'row',
                alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: F.line }}>
              <View style={{ width: 42, height: 42, borderRadius: 21,
                backgroundColor: p.color || F.cream,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{p.emoji || '👤'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
                  {p.name}
                </Text>
                <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                  {p.split_count} split{p.split_count === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 16, color: p.owed > 0 ? F.coral : F.ink2,
                  fontWeight: '600' }}>
                  {fmt(sym, p.owed)}
                </Text>
                <Text style={{ fontSize: 10, color: F.ink3 }}>owes you</Text>
              </View>
            </TouchableOpacity>
          </SwipeableRow>
        ))}

        <TouchableOpacity
          onPress={() => navigation.navigate('EditPerson')}
          activeOpacity={0.85}
          style={{ marginTop: 8, padding: 14, borderRadius: 14,
            backgroundColor: F.surface, borderWidth: 1, borderColor: F.line,
            alignItems: 'center' }}>
          <Text style={{ color: F.ink2, fontSize: 13 }}>+ Add person</Text>
        </TouchableOpacity>
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditPerson')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add person"
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

export default React.memo(People);
