// PS-07 — Trip picker used by AllExpenses' batch "Tag to trip" action.
// Mirrors CategoryPickerSheet shape so the calling code stays symmetrical
// across the two batch operations.
import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useApp } from '../../../hooks/useAppState';

export default function TripPickerSheet({ visible, count, onClose, onPick }) {
  const { F } = useTheme();
  const { trips } = useApp();
  const insets = useSafeAreaInsets();

  // Order: ongoing/upcoming first by start_date asc, then past trips desc.
  const today = new Date().toISOString().slice(0, 10);
  const sorted = (trips || []).slice().sort((a, b) => {
    const aPast = (a.end_date || '') < today;
    const bPast = (b.end_date || '') < today;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return (a.start_date || '').localeCompare(b.start_date || '');
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable onPress={(e) => e.stopPropagation()}
          style={{ marginTop: 'auto', backgroundColor: F.bg,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingTop: 18, paddingBottom: insets.bottom + 16, paddingHorizontal: 18,
            maxHeight: '80%' }}>
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: F.line }}/>
          </View>
          <Text style={{ fontSize: 18, color: F.ink, marginBottom: 2 }}>Tag to trip…</Text>
          <Text style={{ fontSize: 12, color: F.ink2, marginBottom: 14 }}>
            {count} selected spend{count === 1 ? '' : 's'} will be tagged to the chosen trip.
          </Text>

          {sorted.length === 0 ? (
            <View style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1,
              borderColor: F.line, padding: 18, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: F.ink2 }}>No trips planned yet.</Text>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 4 }}>
                Plan a trip first from the Travel tab.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flexGrow: 0 }}>
              <View style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1,
                borderColor: F.line, overflow: 'hidden' }}>
                {sorted.map((t, i) => (
                  <TouchableOpacity key={t.id} onPress={() => onPick(t.id)} activeOpacity={0.7}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                      borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                    }}>
                    <View style={{ width: 38, height: 38, borderRadius: 12,
                      backgroundColor: F.coral,
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18 }}>✈️</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
                        {t.destination || t.name}
                      </Text>
                      {(t.start_date || t.end_date) ? (
                        <Text style={{ fontSize: 11, color: F.ink3 }}>
                          {t.start_date || '?'} → {t.end_date || '?'}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => onPick(null)} activeOpacity={0.7}
                style={{ marginTop: 12, padding: 14, borderRadius: 12, alignItems: 'center',
                  backgroundColor: F.cream, borderWidth: 1, borderColor: F.line }}>
                <Text style={{ fontSize: 13, color: F.ink2, fontWeight: '600' }}>Clear trip tag</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
