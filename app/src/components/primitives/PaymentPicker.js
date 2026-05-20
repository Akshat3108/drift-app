import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { PAYMENT_METHODS, PAYMENT_LABELS } from '@features/expenses/filters';

function PaymentPicker({ value, onChange, F }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {PAYMENT_METHODS.map((pm) => {
        const sel = value === pm;
        return (
          <TouchableOpacity key={pm} onPress={() => onChange(sel ? null : pm)} activeOpacity={0.75}
            style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
              backgroundColor: sel ? F.coral : F.surface,
              borderWidth: 1, borderColor: sel ? F.coral : F.line,
            }}>
            <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink, fontWeight: sel ? '700' : '500' }}>
              {PAYMENT_LABELS[pm]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default React.memo(PaymentPicker);
