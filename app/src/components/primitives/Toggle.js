import React from 'react';
import { View, TouchableOpacity } from 'react-native';

export const Toggle = React.memo(function Toggle({ value, onChange, F }) {
  return (
    <TouchableOpacity onPress={() => onChange(!value)} activeOpacity={0.8}
      style={{ width: 44, height: 26, borderRadius: 13,
        backgroundColor: value ? F.coral : F.line, justifyContent: 'center' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
        position: 'absolute', left: value ? 22 : 2,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 }}/>
    </TouchableOpacity>
  );
});
