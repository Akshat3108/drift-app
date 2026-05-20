// 5.8 — lightweight category picker used by the AllExpenses batch action bar
// when the user taps "Recategorize". Renders the existing `pots` list in a
// bottom modal. Tapping a row fires `onPick(id)`; the parent screen shows
// the confirmation Alert + runs the bulk update.
import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useApp } from '../../../hooks/useAppState';
import { potBg } from '../../../theme';

export default function CategoryPickerSheet({ visible, count, onClose, onPick }) {
  const { F } = useTheme();
  const { pots } = useApp();
  const insets = useSafeAreaInsets();

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
          <Text style={{ fontSize: 18, color: F.ink, marginBottom: 2 }}>Move to…</Text>
          <Text style={{ fontSize: 12, color: F.ink2, marginBottom: 14 }}>
            {count} selected spend{count === 1 ? '' : 's'} will move to the chosen category.
          </Text>

          <ScrollView style={{ flexGrow: 0 }}>
            <View style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1,
              borderColor: F.line, overflow: 'hidden' }}>
              {(pots || []).map((p, i) => (
                <TouchableOpacity key={p.id} onPress={() => onPick(p.id)} activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                    borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                  }}>
                  <View style={{
                    width: 38, height: 38, borderRadius: 12,
                    backgroundColor: potBg(F, p.color || 'cream'),
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 18 }}>{p.emoji || '💰'}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, color: F.ink, fontWeight: '600' }}>{p.label || p.name}</Text>
                  <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => onPick(null)} activeOpacity={0.7}
              style={{ marginTop: 12, padding: 14, borderRadius: 12, alignItems: 'center',
                backgroundColor: F.cream, borderWidth: 1, borderColor: F.line }}>
              <Text style={{ fontSize: 13, color: F.ink2, fontWeight: '600' }}>Clear category</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
