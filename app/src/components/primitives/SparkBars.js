import React from 'react';
import { View, Text } from 'react-native';

export function SparkBars({ data, color, F, height = 60 }) {
  const max = Math.max(...data.map(d => d.v || d));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 4 }}>
      {data.map((d, i) => {
        const v = d.v || d;
        const h = (v / max) * (height - 14);
        const isLast = i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: '100%', height: h, borderRadius: 4,
              backgroundColor: isLast ? color : color, opacity: isLast ? 1 : 0.25 }}/>
            {d.m && <Text style={{ fontSize: 8, color: F.ink3, marginTop: 3 }}>{d.m}</Text>}
          </View>
        );
      })}
    </View>
  );
}
