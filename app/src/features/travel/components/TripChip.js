// 8.3 — memoised trip-chip for Travel's horizontal FlatList. Extracted
// from the inline JSX in Travel.js:53-67. Bounded N (≤ ~10-20 trips in
// practice) but kept consistent with the rest of the 8.3 row-extraction
// pass for readability + future-proofing.

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

function TripChip({ trip, F, isSelected, onPress }) {
  return (
    <TouchableOpacity
      onPress={() => onPress(trip.id)}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`Trip: ${trip.name}`}
      accessibilityState={{ selected: isSelected }}
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
        backgroundColor: isSelected ? F.coral : F.surface,
        borderWidth: 1, borderColor: isSelected ? F.coral : F.line,
      }}
    >
      <Text style={{
        color: isSelected ? '#fff' : F.ink2,
        fontSize: 12, fontWeight: '600',
      }}>
        {trip.name}
      </Text>
    </TouchableOpacity>
  );
}

export default React.memo(TripChip);
