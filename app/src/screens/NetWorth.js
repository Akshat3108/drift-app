import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';

const ASSETS = [
  { l: 'Chase Checking', v: 4287,  k: 'cash', e: '🏦' },
  { l: 'Ally Savings',   v: 12400, k: 'cash', e: '💰' },
  { l: 'Vanguard VTI',   v: 18200, k: 'inv',  e: '📈' },
  { l: 'Bitcoin',        v: 4100,  k: 'inv',  e: '₿'  },
  { l: 'Cash on hand',   v: 320,   k: 'cash', e: '💵' },
];
const LIABS = [
  { l: 'Amex Gold',    v: 842,  e: '💳' },
  { l: 'Student loan', v: 9200, e: '🎓' },
];

export default function NetWorth() {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();
  const at = ASSETS.reduce((s, a) => s + a.v, 0);
  const lt = LIABS.reduce((s, l) => s + l.v, 0);
  const net = at - lt;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
      {/* Hero */}
      <View style={{ backgroundColor: F.cream, borderRadius: 26, padding: 24, marginTop: 16, marginBottom: 20 }}>
        <Text style={{ fontSize: 13, color: F.ink2 }}>Net worth</Text>
        <Text style={{ fontSize: 48, color: F.ink, fontWeight: '400', marginTop: 4 }}>{sym}{net.toLocaleString()}</Text>
        <Text style={{ fontSize: 13, color: F.sageD, marginTop: 4 }}>↑ {sym}820 this month · +2.1%</Text>
      </View>

      {/* Assets */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontSize: 18, color: F.ink }}>Assets</Text>
        <Text style={{ fontSize: 16, color: F.sageD }}>+{sym}{at.toLocaleString()}</Text>
      </View>
      <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1, borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        {ASSETS.map((a, i) => (
          <View key={a.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
            padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              backgroundColor: a.k === 'cash' ? F.mint : F.lilac,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16 }}>{a.e}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 14, color: F.ink2 }}>{a.l}</Text>
            <Text style={{ fontSize: 15, color: F.ink, fontWeight: '500' }}>{sym}{a.v.toLocaleString()}</Text>
          </View>
        ))}
      </View>

      {/* Liabilities */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontSize: 18, color: F.ink }}>Liabilities</Text>
        <Text style={{ fontSize: 16, color: F.coral }}>−{sym}{lt.toLocaleString()}</Text>
      </View>
      <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
        {LIABS.map((a, i) => (
          <View key={a.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
            padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: F.blush, flexShrink: 0,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16 }}>{a.e}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 14, color: F.ink2 }}>{a.l}</Text>
            <Text style={{ fontSize: 15, color: F.coral, fontWeight: '500' }}>−{sym}{a.v.toLocaleString()}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
