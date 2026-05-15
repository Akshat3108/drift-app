import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';

export default function Subs({ navigation }) {
  const { F, sym, subs, cancelSub, reinstateSub, removeSub } = useApp();
  const insets = useSafeAreaInsets();
  const active = subs.filter(s => !s.cancelled);
  const total = active.reduce((s, x) => s + x.amount, 0);
  const cancellable = subs.filter(s => s.verdict === 'cancel' && !s.cancelled);

  const handleCancel = (sub) => {
    Alert.alert(`Cancel ${sub.name}?`, `Save ${sym}${sub.amount.toFixed(2)}/${sub.period}`, [
      { text: 'Cancel it', style: 'destructive', onPress: () => cancelSub(sub.id) },
      { text: 'Keep', style: 'cancel' },
    ]);
  };

  const handleLongPress = (sub) => {
    Alert.alert(sub.name, null, [
      { text: 'Edit', onPress: () => navigation.navigate('EditSub', { id: sub.id }) },
      { text: 'Delete', style: 'destructive', onPress: () => removeSub(sub.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 140, paddingHorizontal: 20 }}
      >
        <Text style={{ fontSize: 13, color: F.ink2 }}>You're paying</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {sym}{total.toFixed(2)}<Text style={{ fontSize: 18, color: F.ink2 }}> /mo</Text>
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 20 }}>
          for {active.length} thing{active.length === 1 ? '' : 's'} ·{' '}
          <Text style={{ color: F.coral }}>{sym}{(total * 12).toFixed(0)}/yr</Text>
        </Text>

        {cancellable.length > 0 && (
          <View style={{ backgroundColor: F.coral, borderRadius: 22, padding: 20, marginBottom: 20 }}>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '700',
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>✨ a gentle suggestion</Text>
            <Text style={{ fontSize: 18, color: '#fff', fontWeight: '400', lineHeight: 26, marginBottom: 14 }}>
              Cancel <Text style={{ fontStyle: 'italic', textDecorationLine: 'underline' }}>
                {cancellable.map(c => c.name).join(' & ')}
              </Text>{cancellable.some(c => c.used_freq) ? ' — unused recently.' : '.'}
            </Text>
            <TouchableOpacity
              onPress={() => cancellable.forEach(s => cancelSub(s.id))}
              style={{ backgroundColor: '#fff', borderRadius: 99, paddingVertical: 10,
                paddingHorizontal: 16, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: F.coral, fontWeight: '700', fontSize: 13 }}>
                Cancel all · save {sym}{cancellable.reduce((s, x) => s + x.amount, 0).toFixed(2)}/mo
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {subs.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🔄</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No subscriptions yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              Tap + to track Netflix, gym, Spotify…
            </Text>
          </View>
        )}

        {subs.map((s) => {
          const vcolor = s.cancelled ? F.ink3 : s.verdict === 'cancel' ? F.coral : s.verdict === 'review' ? F.warn : F.sageD;
          const vbg    = s.cancelled ? F.surface : s.verdict === 'cancel' ? '#fde2dc' : s.verdict === 'review' ? '#fdf0d4' : F.mint;
          return (
            <TouchableOpacity
              key={s.id}
              onLongPress={() => handleLongPress(s)}
              onPress={() => navigation.navigate('EditSub', { id: s.id })}
              activeOpacity={0.85}
              style={{ backgroundColor: F.surface, borderRadius: 18,
                padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: F.line, opacity: s.cancelled ? 0.5 : 1 }}
            >
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: s.color,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20 }}>{s.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink,
                  textDecorationLine: s.cancelled ? 'line-through' : 'none' }}>{s.name}</Text>
                <Text style={{ fontSize: 12, color: F.ink2 }}>
                  {s.cancelled ? 'Cancelled' : (s.used_freq || `${sym}${s.amount.toFixed(2)}/${s.period}`)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={{ fontSize: 16, color: F.ink }}>{sym}{s.amount.toFixed(2)}</Text>
                <View style={{ backgroundColor: vbg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: vcolor, fontSize: 10, fontWeight: '700' }}>
                    {s.cancelled ? 'done' : s.verdict}
                  </Text>
                </View>
                {!s.cancelled ? (
                  <TouchableOpacity onPress={() => handleCancel(s)}>
                    <Text style={{ color: '#e55', fontSize: 11, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => reinstateSub(s.id)}>
                    <Text style={{ color: F.coral, fontSize: 11, fontWeight: '600' }}>Reinstate</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditSub')}
        activeOpacity={0.85}
        style={{
          position: 'absolute', right: 22, bottom: insets.bottom + 86,
          width: 56, height: 56, borderRadius: 28, backgroundColor: F.coral,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: F.coral, shadowOpacity: 0.45, shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 }, elevation: 10,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}
