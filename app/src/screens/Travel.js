import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';

export default function Travel() {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
      {/* Hero */}
      <View style={{ marginTop: 16, borderRadius: 26, padding: 24, marginBottom: 20,
        backgroundColor: '#e85d44' }}>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '700',
          letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>✈️ UPCOMING TRIP</Text>
        <Text style={{ fontSize: 34, color: '#fff', fontStyle: 'italic' }}>Tokyo & Kyoto</Text>
        <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>Aug 14 – 28, 2026 · 14 days</Text>
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 20 }}>
          {[['Budget',`${sym}3,000`],['Per day',`${sym}214`],['Saved',`${sym}1,240`]].map(([l,v]) => (
            <View key={l}>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{l}</Text>
              <Text style={{ fontSize: 22, color: '#fff' }}>{v}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Currencies */}
      <Text style={{ fontSize: 18, color: F.ink, marginBottom: 12 }}>Currencies</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1, borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        {[{c:'USD',s:'$',n:'Home',rate:'1.00',amt:1240},{c:'JPY',s:'¥',n:'Japan',rate:'150.4',amt:186496,primary:true},{c:'EUR',s:'€',n:'Wallet',rate:'0.93',amt:0}].map((cu, i) => (
          <View key={cu.c} style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
            padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, flexShrink: 0,
              backgroundColor: cu.primary ? F.coral : F.cream,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22, color: cu.primary ? '#fff' : F.coral }}>{cu.s}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: F.ink }}>{cu.c} · {cu.n}</Text>
              <Text style={{ fontSize: 12, color: F.ink3 }}>1 USD = {cu.rate} {cu.c}</Text>
            </View>
            <Text style={{ fontSize: 16, color: F.ink }}>{cu.s}{cu.amt.toLocaleString()}</Text>
          </View>
        ))}
      </View>

      {/* Category breakdown */}
      <Text style={{ fontSize: 18, color: F.ink, marginBottom: 12 }}>What you'll spend on</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[['🏨 Stay',`${sym}1,200`,'40%',F.coral],['🍣 Food',`${sym}600`,'20%',F.butterD],['🎌 Activities',`${sym}500`,'17%',F.sageD],['🚄 Transit',`${sym}400`,'13%',F.sky2]].map(([l,v,p,c]) => (
          <View key={l} style={{ width: '47%', backgroundColor: F.surface, borderRadius: 16, padding: 14,
            borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 13, color: F.ink2 }}>{l}</Text>
            <Text style={{ fontSize: 20, color: F.ink, marginTop: 4 }}>{v}</Text>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: F.line, marginTop: 8 }}>
              <View style={{ height: '100%', width: p, backgroundColor: c, borderRadius: 2 }}/>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
