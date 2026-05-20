import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

const MOODS = [
  { e: '😍', l: 'Loved it' }, { e: '😌', l: 'Worth it' }, { e: '😐', l: 'Neutral' },
  { e: '😬', l: 'Unsure'  }, { e: '😞', l: 'Regret'   },
];

export const MoodPicker = React.memo(function MoodPicker({ value, onChange, onClear, selected = true, F }) {
  if (!selected) {
    return (
      <TouchableOpacity
        onPress={() => onChange(value ?? 1)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Add mood"
        style={{ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8,
          borderRadius: 99, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 14, color: F.ink2 }}>＋</Text>
        <Text style={{ fontSize: 13, color: F.ink2 }}>Add mood</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View>
      {onClear && (
        <TouchableOpacity
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear mood"
          style={{ position: 'absolute', right: 0, top: 0, paddingHorizontal: 8, paddingVertical: 4 }}
          hitSlop={10}>
          <Text style={{ fontSize: 12, color: F.ink3 }}>Clear</Text>
        </TouchableOpacity>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {MOODS.map((m, i) => (
          <TouchableOpacity key={m.e} onPress={() => onChange(i)} activeOpacity={0.8}
            style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
              backgroundColor: value === i ? F.cream : 'transparent',
              borderWidth: 2, borderColor: value === i ? F.coral : 'transparent' }}>
            <Text style={{ fontSize: 26 }}>{m.e}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ textAlign: 'center', fontSize: 12, color: F.ink2, marginTop: 8 }}>
        "{MOODS[value]?.l}"
      </Text>
    </View>
  );
});
