import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useProfile } from '../context';
import { Toggle } from '@components/primitives/Toggle';
import { CURRENCIES } from '@core/domain/currencies';
import { AVATAR_CHOICES } from '@core/domain/avatars';
import {
  bundleForExport,
  clearCandidates,
  listCandidates,
  getEnabled as getGoldenEnabled,
  setEnabled as setGoldenEnabled,
} from '@ocr/golden/capture';

function Row({ icon, label, sub, right, F, onPress }) {
  const inner = (
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
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>
  ) : inner;
}

function Profile({ navigation }) {
  const { F, sym, profile, subs, goals, expenses, settings, monthBudget, totalSpend,
    setSetting, updateProfile, resetApp } = useApp();
  const { recentSearches, clearRecentSearches } = useProfile();
  const insets = useSafeAreaInsets();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(profile?.name || '');
  const [avatar, setAvatar] = useState(profile?.avatar || 'U');
  // 4.19 — auto-capture state. `enabled` is read once at mount and kept in
  // local state so the toggle re-renders immediately on tap; the underlying
  // store lives in the FS-backed config file (no DB migration). `count`
  // reflects the number of captured candidates pending export.
  const [goldenEnabled, setGoldenEnabledState] = useState(true);
  const [goldenCount, setGoldenCount] = useState(0);
  const [goldenBusy, setGoldenBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const en = await getGoldenEnabled();
      const list = await listCandidates();
      if (!cancelled) { setGoldenEnabledState(en); setGoldenCount(list.length); }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleGolden = async (v) => {
    setGoldenEnabledState(v);
    await setGoldenEnabled(v);
  };

  const exportGolden = async () => {
    setGoldenBusy(true);
    try {
      const { path, count } = await bundleForExport();
      if (count === 0) {
        Alert.alert('Nothing to export', 'No captured receipts yet. Scan a few first.');
        return;
      }
      // Lazy-require expo-sharing so the file imports cleanly even if the
      // dep hasn't been installed yet. Surfaces a useful error to the user
      // rather than a Metro bundling failure.
      let Sharing;
      try {
        Sharing = require('expo-sharing');
      } catch (e) {
        Alert.alert(
          'Sharing unavailable',
          `Install \`expo-sharing\` in app/ to enable export. The bundle is saved at:\n${path}\n(${count} captured receipt${count === 1 ? '' : 's'})`,
        );
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', `The OS doesn't expose a share sheet on this device. Bundle saved at:\n${path}`);
        return;
      }
      await Sharing.shareAsync(path, {
        mimeType: 'application/json',
        dialogTitle: 'Share captured receipts',
        UTI: 'public.json',
      });
    } catch (e) {
      Alert.alert('Export failed', e.message || String(e));
    } finally {
      setGoldenBusy(false);
    }
  };

  const clearGolden = () => {
    Alert.alert('Clear captured receipts?',
      `Removes ${goldenCount} captured receipt${goldenCount === 1 ? '' : 's'} from this device. Your saved expenses are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: async () => {
          await clearCandidates();
          setGoldenCount(0);
        }},
      ]);
  };

  const activeSubs = subs.filter(s => !s.cancelled).length;
  const savedThisMonth = Math.max(0, monthBudget - totalSpend);
  const totalLogged = expenses.length;

  const saveProfile = async () => {
    if (!name.trim()) return Alert.alert('Name required');
    await updateProfile({ name: name.trim(), avatar });
    setEditingName(false);
  };

  const handleClearSearches = () => {
    Alert.alert('Clear search history?',
      `Removes ${recentSearches.length} recent search${recentSearches.length === 1 ? '' : 'es'} from this device. Your saved expenses are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => { clearRecentSearches().catch(() => {}); } },
      ]);
  };

  const handleReset = () => {
    Alert.alert('Reset all data?',
      'This will permanently delete your profile, categories, expenses, subscriptions, goals, accounts, and trips. You\'ll be returned to onboarding.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset everything', style: 'destructive', onPress: () => resetApp() },
      ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 60, paddingHorizontal: 20 }}>

      <TouchableOpacity
        onPress={() => setEditingName(true)}
        activeOpacity={0.85}
        style={{ backgroundColor: F.cream, borderRadius: 26, padding: 20,
          flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: F.surface,
          alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 34, color: F.coral }}>{profile?.avatar || 'U'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, color: F.ink }}>{profile?.name || 'You'}</Text>
          <Text style={{ fontSize: 13, color: F.ink2 }}>Tap to edit profile</Text>
        </View>
        <Text style={{ fontSize: 18, color: F.ink3 }}>›</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>Preferences</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        <Row icon="🌐" label="Currency" sub="Used everywhere" F={F}
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
        <Row icon={settings.dark_mode ? '🌙' : '☀️'} label="Dark mode" sub="Toggle light/dark" F={F}
          right={<Toggle value={!!settings.dark_mode} onChange={v => setSetting('dark_mode', v ? 1 : 0)} F={F}/>}/>
        <Row icon="🌱" label="Carbon tracking" sub="CO₂ estimate per expense" F={F}
          right={<Toggle value={!!settings.carbon_tracking} onChange={v => setSetting('carbon_tracking', v ? 1 : 0)} F={F}/>}/>
      </View>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>Your stats</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        {[
          ['💰', 'Saved',  `${sym}${savedThisMonth.toFixed(0)}`],
          ['🎯', 'Goals',  `${goals.length}`],
          ['🔄', 'Subs',   `${activeSubs}`],
          ['📒', 'Spends', `${totalLogged}`],
        ].map(([e, l, v]) => (
          <View key={l} style={{ flex: 1, backgroundColor: F.surface, borderRadius: 16, padding: 12,
            alignItems: 'center', borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 20 }}>{e}</Text>
            <Text style={{ fontSize: 16, color: F.coral, marginTop: 4 }}>{v}</Text>
            <Text style={{ fontSize: 10, color: F.ink3 }}>{l}</Text>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>Items & trends</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        <Row icon="📈" label="Tracked items" sub="Price & consumption history" F={F}
          onPress={() => navigation.navigate('Items')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🏪" label="Top merchants" sub="Where your money goes most" F={F}
          onPress={() => navigation.navigate('Merchants')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
      </View>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>Help improve scans</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        <Row icon="🔬" label="Auto-capture" sub="Save uncertain scans for the parser dataset" F={F}
          right={<Toggle value={goldenEnabled} onChange={toggleGolden} F={F}/>}/>
        <Row icon="📤"
          label={goldenBusy ? 'Preparing export…' : 'Export receipts for parser improvement'}
          sub={goldenCount > 0 ? `${goldenCount} captured · text only, no images` : 'Nothing captured yet'}
          F={F}
          onPress={goldenBusy ? undefined : exportGolden}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        {goldenCount > 0 && (
          <Row icon="🗑️" label="Clear captured" sub="Remove captured receipts from device" F={F}
            onPress={clearGolden}
            right={<Text style={{ fontSize: 16, color: '#e55' }}>›</Text>}/>
        )}
      </View>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>More</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden' }}>
        <Row icon="📤" label="Export your data" sub="CSV, JSON, or PDF · choose a date range" F={F}
          onPress={() => navigation.navigate('Export')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🗂️" label="Manage categories" F={F}
          onPress={() => navigation.navigate('EditPot')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        {recentSearches.length > 0 && (
          <Row icon="🕘" label="Clear search history" sub={`${recentSearches.length} recent search${recentSearches.length === 1 ? '' : 'es'}`} F={F}
            onPress={handleClearSearches}
            right={<Text style={{ fontSize: 16, color: '#e55' }}>›</Text>}/>
        )}
        <Row icon="🗑️" label="Reset all data" sub="Wipe profile + data" F={F}
          onPress={handleReset}
          right={<Text style={{ fontSize: 16, color: '#e55' }}>›</Text>}/>
      </View>

      <Text style={{ textAlign: 'center', fontSize: 11, color: F.ink3, marginTop: 24 }}>
        Drift v1.0.0 · 100% offline
      </Text>

      <Modal visible={editingName} animationType="slide" transparent
        onRequestClose={() => setEditingName(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: F.bg, padding: 24,
            borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ fontSize: 20, color: F.ink, marginBottom: 16 }}>Edit profile</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={F.ink3}
              autoCapitalize="words"
              style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
                backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 14 }}
            />
            <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 8, fontWeight: '700', letterSpacing: 1 }}>
              AVATAR
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {AVATAR_CHOICES.map(a => {
                const sel = a === avatar;
                return (
                  <TouchableOpacity
                    key={a}
                    onPress={() => setAvatar(a)}
                    style={{
                      width: 50, height: 50, borderRadius: 25,
                      backgroundColor: sel ? F.coral : F.cream,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 2, borderColor: sel ? F.coral : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 22, color: sel ? '#fff' : F.coral, fontWeight: '600' }}>{a}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity onPress={() => setEditingName(false)}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: F.surface,
                  borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
                <Text style={{ color: F.ink, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveProfile}
                style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: F.coral, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default React.memo(Profile);
