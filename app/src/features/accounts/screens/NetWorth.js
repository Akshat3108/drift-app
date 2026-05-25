import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import NetWorthChart from '@components/NetWorthChart';

function NetWorth({ navigation }) {
  const { F, sym, accounts } = useApp();
  const insets = useSafeAreaInsets();
  const assets = accounts.filter(a => a.kind === 'asset');
  const liabs  = accounts.filter(a => a.kind === 'liability');
  const at = assets.reduce((s, a) => s + a.balance, 0);
  const lt = liabs.reduce((s, l) => s + l.balance, 0);
  const net = at - lt;

  const Section = ({ title, total, items, kind, sign, totalColor }) => (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontSize: 18, color: F.ink }}>{title}</Text>
        <Text style={{ fontSize: 16, color: totalColor }}>{sign}{sym}{total.toLocaleString()}</Text>
      </View>
      {items.length === 0 ? (
        <TouchableOpacity
          onPress={() => navigation.navigate('EditAccount', { kind })}
          activeOpacity={0.8}
          style={{ borderWidth: 2, borderColor: F.line, borderStyle: 'dashed',
            borderRadius: 20, padding: 18, marginBottom: 20, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, color: F.ink2 }}>+ Add {title.toLowerCase()}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1,
          borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
          {items.map((a, i) => (
            <TouchableOpacity
              key={a.id}
              onPress={() => navigation.navigate('EditAccount', { id: a.id })}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                backgroundColor: kind === 'asset' ? F.mint : F.blush,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16 }}>{a.emoji || '💼'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>{a.label}</Text>
                {a.category && <Text style={{ fontSize: 11, color: F.ink3 }}>{a.category}</Text>}
              </View>
              <Text style={{ fontSize: 15, color: kind === 'asset' ? F.ink : F.coral, fontWeight: '500' }}>
                {sign}{sym}{a.balance.toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => navigation.navigate('EditAccount', { kind })}
            activeOpacity={0.7}
            style={{ padding: 14, borderTopWidth: 1, borderTopColor: F.line, alignItems: 'center' }}
          >
            <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>+ Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
      <View style={{ backgroundColor: F.cream, borderRadius: 26, padding: 24,
        marginTop: 16, marginBottom: 20 }}>
        <Text style={{ fontSize: 13, color: F.ink2 }}>Net worth</Text>
        <Text style={{ fontSize: 48, color: net >= 0 ? F.ink : F.coral,
          fontWeight: '400', marginTop: 4 }}>
          {net < 0 ? '−' : ''}{sym}{Math.abs(net).toLocaleString()}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <Text style={{ fontSize: 12, color: F.sageD }}>+ {sym}{at.toLocaleString()} assets</Text>
          <Text style={{ fontSize: 12, color: F.coral }}>− {sym}{lt.toLocaleString()} owed</Text>
        </View>
      </View>

      {/* 7.13 — Trajectory chart renders only once at least a week of
          snapshots is in the table. AccountsProvider re-stamps today's
          snapshot on every mutation. */}
      <NetWorthChart/>

      <Section title="Assets"      total={at} items={assets} kind="asset"
        sign=""  totalColor={F.sageD}/>
      <Section title="Liabilities" total={lt} items={liabs}  kind="liability"
        sign="−" totalColor={F.coral}/>
    </ScrollView>
  );
}

export default React.memo(NetWorth);
