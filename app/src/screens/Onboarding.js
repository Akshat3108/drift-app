import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { Toggle } from '../components/UI';
import { CURRENCIES, STARTER_CATEGORIES, AVATAR_CHOICES } from '../data/constants';

const W = Dimensions.get('window').width;

export default function Onboarding() {
  const { F, createProfile, setSetting, addCategory } = useApp();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);

  const [step, setStep]         = useState(0);
  const [name, setName]         = useState('');
  const [avatar, setAvatar]     = useState('U');
  const [currency, setCurrency] = useState('INR');
  const [dark, setDark]         = useState(false);
  const [picks, setPicks]       = useState(
    STARTER_CATEGORIES.map((c, i) => ({ ...c, enabled: true, budget: '', sort_order: i }))
  );
  const [saving, setSaving]     = useState(false);

  const sym = CURRENCIES[currency]?.symbol || '₹';

  const goto = (s) => {
    setStep(s);
    scrollRef.current?.scrollTo({ x: s * W, animated: true });
  };

  const next = () => {
    if (step === 0) {
      if (!name.trim()) return Alert.alert('Please enter your name');
      goto(1);
    } else if (step === 1) {
      goto(2);
    } else {
      finish();
    }
  };

  const finish = async () => {
    const chosen = picks.filter(p => p.enabled);
    if (!chosen.length) return Alert.alert('Pick at least one category');
    setSaving(true);
    try {
      await setSetting('currency', currency);
      await setSetting('dark_mode', dark ? 1 : 0);
      for (const c of chosen) {
        await addCategory({
          name: c.name,
          emoji: c.emoji,
          color: c.color,
          budget: parseFloat(c.budget || '0') || 0,
          sort_order: c.sort_order,
        });
      }
      // create profile LAST — once the row exists, AppProvider flips onboarded → true
      // and unmounts this screen, so any subsequent setState would warn.
      await createProfile({ name: name.trim(), avatar });
    } catch (err) {
      setSaving(false);
      Alert.alert('Setup failed', err.message || 'Could not save profile');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: F.bg, paddingTop: insets.top }}>
      {/* Step dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 20, paddingBottom: 8 }}>
        {[0, 1, 2].map(i => (
          <View key={i} style={{
            width: i === step ? 22 : 8, height: 8, borderRadius: 4,
            backgroundColor: i === step ? F.coral : F.line,
          }}/>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
      >
        {/* ── Step 1: Profile ── */}
        <View style={{ width: W, paddingHorizontal: 24, paddingTop: 20 }}>
          <Text style={{ fontSize: 32, color: F.ink, fontWeight: '400' }}>
            Welcome to <Text style={{ color: F.coral, fontStyle: 'italic' }}>Drift</Text>
          </Text>
          <Text style={{ fontSize: 14, color: F.ink2, marginTop: 6 }}>
            Let's set up your profile.
          </Text>

          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 28, marginBottom: 8, fontWeight: '700', letterSpacing: 1 }}>
            YOUR NAME
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Aarav"
            placeholderTextColor={F.ink3}
            autoCapitalize="words"
            style={{
              backgroundColor: F.surface, borderWidth: 1, borderColor: F.line,
              borderRadius: 14, padding: 14, fontSize: 18, color: F.ink,
            }}
          />

          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 24, marginBottom: 8, fontWeight: '700', letterSpacing: 1 }}>
            PICK AN AVATAR
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {AVATAR_CHOICES.map(a => {
              const sel = a === avatar;
              return (
                <TouchableOpacity
                  key={a}
                  onPress={() => setAvatar(a)}
                  style={{
                    width: 52, height: 52, borderRadius: 26,
                    backgroundColor: sel ? F.coral : F.cream,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2, borderColor: sel ? F.coral : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 22, color: sel ? '#fff' : F.coral, fontWeight: '600' }}>{a}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Step 2: Preferences ── */}
        <View style={{ width: W, paddingHorizontal: 24, paddingTop: 20 }}>
          <Text style={{ fontSize: 28, color: F.ink, fontWeight: '400' }}>Preferences</Text>
          <Text style={{ fontSize: 14, color: F.ink2, marginTop: 6 }}>
            Pick your currency and theme.
          </Text>

          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 28, marginBottom: 8, fontWeight: '700', letterSpacing: 1 }}>
            CURRENCY
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {Object.entries(CURRENCIES).map(([code, c]) => {
              const sel = code === currency;
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => setCurrency(code)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
                    backgroundColor: sel ? F.coral : F.surface,
                    borderWidth: 1, borderColor: sel ? F.coral : F.line,
                  }}
                >
                  <Text style={{ fontSize: 20, color: sel ? '#fff' : F.coral, fontWeight: '700' }}>{c.symbol}</Text>
                  <Text style={{ fontSize: 14, color: sel ? '#fff' : F.ink, fontWeight: '600' }}>{code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ marginTop: 28, padding: 16, borderRadius: 14, backgroundColor: F.surface, borderWidth: 1, borderColor: F.line, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={{ fontSize: 24 }}>{dark ? '🌙' : '☀️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: F.ink, fontWeight: '500' }}>Dark mode</Text>
              <Text style={{ fontSize: 12, color: F.ink3 }}>You can change this anytime.</Text>
            </View>
            <Toggle value={dark} onChange={setDark} F={F}/>
          </View>
        </View>

        {/* ── Step 3: Categories ── */}
        <View style={{ width: W, paddingHorizontal: 24, paddingTop: 20, flex: 1 }}>
          <Text style={{ fontSize: 28, color: F.ink, fontWeight: '400' }}>Your pots</Text>
          <Text style={{ fontSize: 14, color: F.ink2, marginTop: 6, marginBottom: 16 }}>
            Pick the categories you want to track. Set a budget if you want — leave 0 to skip.
          </Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
            {picks.map((p, i) => (
              <View key={p.name} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 12, marginBottom: 8, borderRadius: 14,
                backgroundColor: p.enabled ? F.surface : F.bg,
                borderWidth: 1, borderColor: F.line,
                opacity: p.enabled ? 1 : 0.55,
              }}>
                <Text style={{ fontSize: 26 }}>{p.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>{p.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Text style={{ fontSize: 12, color: F.ink3 }}>{sym}</Text>
                    <TextInput
                      value={p.budget}
                      onChangeText={v => {
                        const ns = picks.slice();
                        ns[i] = { ...ns[i], budget: v.replace(/[^0-9.]/g, '') };
                        setPicks(ns);
                      }}
                      placeholder="0"
                      placeholderTextColor={F.ink3}
                      keyboardType="decimal-pad"
                      editable={p.enabled}
                      style={{
                        flex: 1, fontSize: 13, color: F.ink,
                        borderBottomWidth: 1, borderBottomColor: F.line,
                        paddingVertical: 2,
                      }}
                    />
                    <Text style={{ fontSize: 11, color: F.ink3, marginLeft: 6 }}>per month</Text>
                  </View>
                </View>
                <Toggle value={p.enabled} onChange={v => {
                  const ns = picks.slice();
                  ns[i] = { ...ns[i], enabled: v };
                  setPicks(ns);
                }} F={F}/>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={{ flexDirection: 'row', gap: 10, padding: 24, paddingBottom: insets.bottom + 16,
        borderTopWidth: 1, borderTopColor: F.line, backgroundColor: F.surface }}>
        {step > 0 && (
          <TouchableOpacity
            onPress={() => goto(step - 1)}
            style={{ flex: 1, padding: 14, borderRadius: 14, alignItems: 'center',
              backgroundColor: F.bg, borderWidth: 1, borderColor: F.line }}
          >
            <Text style={{ color: F.ink, fontSize: 15, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={next}
          disabled={saving}
          style={{ flex: step > 0 ? 2 : 1, padding: 14, borderRadius: 14,
            alignItems: 'center', backgroundColor: F.coral, opacity: saving ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
            {step < 2 ? 'Continue →' : (saving ? 'Setting up…' : 'Get started')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
