import React from 'react';
import { View } from 'react-native';

export const ProgressBar = React.memo(function ProgressBar({ value, max, color, F, height = 6, style }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: F.line, overflow: 'hidden' }, style]}>
      <View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: color || F.coral, borderRadius: height / 2 }}/>
    </View>
  );
});
