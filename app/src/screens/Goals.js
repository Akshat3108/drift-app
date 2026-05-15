import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { ProgressBar } from '../components/UI';

const EMOJIS = ['✈️','🛟','💻','🏠','🎓','🚗','💍','📚'];

export default function Goals() {
  const { F, sym, goals, addGoal } = useApp();
  const insets = useSafeAreaInsets();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [emoji, setEmoji] = useState('✈️');
  const totalSaved = goals.reduce((s, g) => s + g.have, 0);
  const totalGoal  = goals.reduce((s, g) => s + g.need, 0);

  const saveGoal = () => {
    if (!name || !target) return Alert.alert('Fill in all fields');
    addGoal({ name, emoji, have: 0, need: parseFloat(target), eta: 'Dec 2026' });
    setShowNew(false); setName(''); setTarget(''); setEmoji('✈️');
  };

  const colors = [F.coral, F.sageD, F.sky2, '#9d8fc8'];
  const bgs    = [F.cream, F.mint, F.sky, F.lilac];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}>

      {/* Overall */}
      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 20 }}>
        <Text style={{ fontSize: 12, color: F.ink2 }}>Saved toward goals</Text>
        <Text style={{ fontSize: 44, color: F.ink, fontWeight: '400' }}>{sym}{totalSaved.toLocaleString()}</Text>
        <Text style={{ fontSize: 12, color: F.ink2 }}>
          of {sym}{totalGoal.toLocaleString()} ({Math.round((totalSaved/totalGoal)*100)}%)
        </Text>
        <ProgressBar value={totalSaved} max={totalGoal} color={F.coral} F={F} height={8} style={{ marginTop: 14 }}/>
      </View>

      {/* Goal cards */}
      {goals.map((g, i) => {
        const pct = g.have / g.need;
        return (
          <View key={g.id} style={{ backgroundColor: bgs[i % 4], borderRadius: 22, padding: 18, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: F.surface,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 24 }}>{g.emoji}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 18, color: F.ink }}>{g.name}</Text>
                  <Text style={{ fontSize: 12, color: F.ink3 }}>ETA: {g.eta}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 26, color: colors[i % 4], fontWeight: '400' }}>{Math.round(pct*100)}%</Text>
            </View>
            <ProgressBar value={g.have} max={g.need} color={colors[i % 4]} F={F} height={8}/>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontSize: 13, color: F.ink2 }}><Text style={{ color: F.ink, fontWeight: '600' }}>{sym}{g.have}</Text> saved</Text>
              <Text style={{ fontSize: 13, color: F.ink3 }}>{sym}{g.need - g.have} to go</Text>
            </View>
          </View>
        );
      })}

      {/* Add button */}
      <TouchableOpacity onPress={() => setShowNew(true)}
        style={{ borderWidth: 2, borderColor: F.line, borderStyle: 'dashed', borderRadius: 22,
          padding: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Text style={{ fontSize: 32, marginBottom: 6 }}>+</Text>
        <Text style={{ color: F.ink3, fontSize: 15 }}>New goal</Text>
      </TouchableOpacity>

      {/* New goal modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: F.bg, padding: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
            <Text style={{ fontSize: 22, color: F.ink }}>New goal</Text>
            <TouchableOpacity onPress={() => setShowNew(false)}>
              <Text style={{ color: F.ink2, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {EMOJIS.map(e => (
              <TouchableOpacity key={e} onPress={() => setEmoji(e)}
                style={{ width: 52, height: 52, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: emoji === e ? F.cream : 'transparent',
                  borderWidth: 2, borderColor: emoji === e ? F.coral : F.line }}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput value={name} onChangeText={setName} placeholder="Goal name"
            placeholderTextColor={F.ink3}
            style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
              backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 14 }}/>
          <TextInput value={target} onChangeText={setTarget} placeholder={`Target (${sym})`}
            keyboardType="decimal-pad" placeholderTextColor={F.ink3}
            style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
              backgroundColor: F.surface, fontSize: 22, color: F.ink, marginBottom: 24 }}/>
          <TouchableOpacity onPress={saveGoal}
            style={{ backgroundColor: F.coral, borderRadius: 14, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Create goal</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </ScrollView>
  );
}
