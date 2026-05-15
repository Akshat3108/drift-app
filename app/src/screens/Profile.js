import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { Toggle } from '../components/UI';
import { CURRENCIES } from '../data/constants';

function Row({ icon, label, sub, right, F }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
      padding: 14, borderBottomWidth: 1, borderBottomColor: F.line }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: F.cream,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: F.ink }}>{label}</Text>
        {sub && <Text style={{ fontSize: 12, color: F.ink3 }}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export default function Profile() {
  const { F, sym, subs, goals, settings, setSetting } = useApp();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 60, paddingHorizontal: 20 }}>

      {/* Profile card */}
      <View style={{ backgroundColor: F.cream, borderRadius: 26, padding: 20,
        flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: F.surface,
          alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 34, color: F.coral }}>R</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, color: F.ink }}>Riya Kapoor</Text>
          <Text style={{ fontSize: 13, color: F.ink2 }}>riya@drift.app · Pro</Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 99, paddingHorizontal: 10,
            paddingVertical: 4, alignSelf: 'flex-start', marginTop: 6 }}>
            <Text style={{ color: F.coral, fontSize: 11, fontWeight: '600' }}>🔥 7-day streak</Text>
          </View>
        </View>
      </View>

      {/* Preferences */}
      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>Preferences</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        <Row icon="🌐" label="Currency" sub="Symbol used everywhere" F={F}
          right={
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {Object.keys(CURRENCIES).map(k => (
                <TouchableOpacity key={k} onPress={() => setSetting('currency', k)}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                    backgroundColor: settings.currency === k ? F.coral : F.cream }}>
                  <Text style={{ color: settings.currency === k ? '#fff' : F.ink2, fontSize: 12, fontWeight: '600' }}>
                    {CURRENCIES[k].symbol}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          }/>
        <Row icon={settings.dark ? '🌙' : '☀️'} label="Dark mode" sub="Toggle light/dark" F={F}
          right={<Toggle value={settings.dark} onChange={v => setSetting('dark', v)} F={F}/>}/>
        <Row icon="🌱" label="Carbon tracking" sub="CO₂ estimate per expense" F={F}
          right={<Toggle value={true} F={F}/>}/>
      </View>

      {/* Stats */}
      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>Your stats</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        {[['💰', 'Saved', `${sym}920`], ['🎯', 'Goals', `${goals.length}`], ['🔄', 'Subs', `${subs.filter(s=>!s.cancelled).length}`]].map(([e, l, v]) => (
          <View key={l} style={{ flex: 1, backgroundColor: F.surface, borderRadius: 16, padding: 14,
            alignItems: 'center', borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 22 }}>{e}</Text>
            <Text style={{ fontSize: 22, color: F.coral, marginTop: 4 }}>{v}</Text>
            <Text style={{ fontSize: 11, color: F.ink3 }}>{l}</Text>
          </View>
        ))}
      </View>

      {/* More */}
      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>More</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden' }}>
        <Row icon="🔔" label="Notifications" sub="Budget alerts & nudges" F={F}/>
        <Row icon="📤" label="Export data" sub="CSV or PDF" F={F}/>
        <Row icon="❔" label="Help & feedback" F={F}/>
      </View>

      <Text style={{ textAlign: 'center', fontSize: 11, color: F.ink3, marginTop: 24 }}>Drift v1.0.0</Text>
    </ScrollView>
  );
}
