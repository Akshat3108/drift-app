import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useProfile } from '../context';
import { Toggle } from '@components/primitives/Toggle';
import { CURRENCIES } from '@core/domain/currencies';
import { AVATAR_CHOICES } from '@core/domain/avatars';
import { useNotifications } from '@features/notifications/context';
import { useToast } from '@components/Toast';
import { createBackup, restoreBackup } from '../../../backup';
import { BackupAuthError } from '../../../backup/crypto';
import * as LocalAuth from '../../lock/LocalAuth';
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
  const notifications = useNotifications();
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
  // 8.8 — backup/restore modal state.
  const toast = useToast();
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupPass, setBackupPass] = useState('');
  const [backupPassConfirm, setBackupPassConfirm] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);     // { uri, name }
  const [restorePass, setRestorePass] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreErr, setRestoreErr] = useState('');
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

  // 8.10 — hidden Diagnostics entry: 5 taps on the footer within 3 s
  // navigates to Diagnostics. Counter resets to 0 on idle timeout.
  // Same gesture as Android's "tap Build number to enable Developer mode".
  const footerTapsRef = useRef(0);
  const footerTimerRef = useRef(null);
  const onFooterTap = () => {
    if (footerTimerRef.current) clearTimeout(footerTimerRef.current);
    footerTapsRef.current += 1;
    if (footerTapsRef.current >= 5) {
      footerTapsRef.current = 0;
      navigation.navigate('Diagnostics');
      return;
    }
    footerTimerRef.current = setTimeout(() => { footerTapsRef.current = 0; }, 3000);
  };
  useEffect(() => () => { if (footerTimerRef.current) clearTimeout(footerTimerRef.current); }, []);

  const saveProfile = async () => {
    if (!name.trim()) return Alert.alert('Name required');
    await updateProfile({ name: name.trim(), avatar });
    setEditingName(false);
  };

  const notifEnabled = !!settings.notifications_enabled;
  const notifThreshold = Number.isFinite(settings.notif_budget_threshold)
    ? settings.notif_budget_threshold
    : 0.8;
  const notifLead = Number.isInteger(settings.notif_sub_lead_days)
    ? settings.notif_sub_lead_days
    : 3;
  const thresholdBands = [0.7, 0.8, 0.9, 1.0];
  const leadChoices = [0, 1, 3, 7];

  const handleToggleNotifications = async (v) => {
    if (!notifications) return;
    if (v && !notifications.available) {
      Alert.alert(
        'Notifications not available',
        'Rebuild the app (npm run android) to enable notifications.'
      );
      return;
    }
    const res = await notifications.toggleEnabled(v, setSetting);
    if (v && !res.granted) {
      Alert.alert(
        'Permission denied',
        'Enable notifications for Drift in your device settings, then toggle this on again.'
      );
    }
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

  // 8.11 — App lock toggle handler.
  //
  // Enable path is gated by a four-step probe:
  //   1. native module loaded   → otherwise prompt to rebuild
  //   2. hasHardwareAsync       → otherwise inform: device has no biometric/PIN
  //   3. isEnrolledAsync        → otherwise send the user to OS settings
  //   4. authenticate() once    → confirms the credential actually works before
  //                               persisting. No state change on cancel/fail.
  //
  // Disable path also requires a successful authenticate() when the gate is
  // currently engageable, so a hand-off-unlocked-phone attacker can't silently
  // disable the lock. If the gate has become un-engageable since enable
  // (hardware/enrolment vanished), we skip the auth so the user isn't stuck.
  const lockEnabled = !!settings.app_lock_enabled;
  const handleToggleLock = async (v) => {
    if (v) {
      if (!LocalAuth.isAvailable()) {
        Alert.alert('App lock unavailable',
          'Rebuild the app (npm run android) to enable app lock.');
        return;
      }
      if (!(await LocalAuth.hasHardwareAsync())) {
        Alert.alert('No biometric or PIN hardware',
          'This device doesn\'t expose a biometric sensor or screen lock that Drift can use.');
        return;
      }
      if (!(await LocalAuth.isEnrolledAsync())) {
        Alert.alert('Set up device security first',
          'Add a fingerprint, face, or screen lock in your device settings, then try again.');
        return;
      }
      const res = await LocalAuth.authenticate({ promptMessage: 'Confirm to enable app lock' });
      if (!res.success) return;
      await setSetting('app_lock_enabled', 1);
      toast('App lock enabled');
    } else {
      const available = LocalAuth.isAvailable();
      const enrolled = available && (await LocalAuth.hasHardwareAsync()) && (await LocalAuth.isEnrolledAsync());
      if (enrolled) {
        const res = await LocalAuth.authenticate({ promptMessage: 'Confirm to disable app lock' });
        if (!res.success) return;
      }
      await setSetting('app_lock_enabled', 0);
      toast('App lock disabled');
    }
  };

  // 8.8 — Backup handlers.
  const handleCreateBackup = async () => {
    if (backupBusy) return;
    if (backupPass.length < 8) { Alert.alert('Passphrase too short', 'Use at least 8 characters.'); return; }
    if (backupPass !== backupPassConfirm) { Alert.alert('Passphrases do not match'); return; }
    setBackupBusy(true);
    try {
      const { path, bytes } = await createBackup({ passphrase: backupPass });
      setBackupOpen(false);
      setBackupPass(''); setBackupPassConfirm('');
      const sizeMb = (bytes / 1024 / 1024).toFixed(2);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: 'application/octet-stream',
          dialogTitle: `Drift backup (${sizeMb} MB)`,
        });
      } else {
        Alert.alert('Backup saved', `Wrote ${sizeMb} MB to ${path}`);
      }
      toast(`Backup created (${sizeMb} MB)`);
    } catch (e) {
      Alert.alert('Backup failed', e.message || String(e));
    } finally {
      setBackupBusy(false);
    }
  };

  const handlePickRestoreFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setRestoreFile({ uri: a.uri, name: a.name || 'backup.driftbackup' });
      setRestoreErr('');
    } catch (e) {
      Alert.alert('Could not pick file', e.message || String(e));
    }
  };

  const handleRunRestore = async () => {
    if (restoreBusy || !restoreFile || !restorePass) return;
    setRestoreBusy(true);
    setRestoreErr('');
    try {
      await restoreBackup({ uri: restoreFile.uri, passphrase: restorePass });
      setRestoreOpen(false);
      setRestoreFile(null); setRestorePass(''); setRestoreErr('');
      toast('Restore complete');
      // Reload — the app's state is built on a different DB now. Send the
      // user back to the root so every provider re-mounts.
      navigation.popToTop?.();
    } catch (e) {
      if (e instanceof BackupAuthError) {
        setRestoreErr('Wrong passphrase, or the backup file was modified.');
      } else {
        setRestoreErr(e.message || String(e));
      }
    } finally {
      setRestoreBusy(false);
    }
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
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Currency ${k}`}
                  accessibilityState={{ selected: settings.currency === k }}
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
        textTransform: 'uppercase', marginBottom: 8 }}>Notifications</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        <Row icon="🔔" label="Enable notifications"
          sub={notifEnabled
            ? (notifications?.unreadCount ? `${notifications.unreadCount} unread` : 'On')
            : 'Budget alerts and sub-due reminders'}
          F={F}
          right={<Toggle value={notifEnabled} onChange={handleToggleNotifications} F={F}/>}/>
        {notifEnabled && (
          <>
            <Row icon="📊" label="Budget alert at" sub="Fires once per category per month" F={F}
              right={
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {thresholdBands.map(b => {
                    const sel = Math.abs(notifThreshold - b) < 0.01;
                    return (
                      <TouchableOpacity key={b} onPress={() => setSetting('notif_budget_threshold', b)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Budget threshold ${Math.round(b * 100)} percent`}
                        accessibilityState={{ selected: sel }}
                        style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8,
                          backgroundColor: sel ? F.coral : F.cream }}>
                        <Text style={{ color: sel ? '#fff' : F.ink2, fontSize: 12, fontWeight: '600' }}>
                          {Math.round(b * 100)}%
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              }/>
            <Row icon="⏰" label="Remind subs"
              sub={notifLead === 0 ? 'Reminders disabled' : `${notifLead} day${notifLead === 1 ? '' : 's'} before due`}
              F={F}
              right={
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {leadChoices.map(d => {
                    const sel = notifLead === d;
                    return (
                      <TouchableOpacity key={d} onPress={() => setSetting('notif_sub_lead_days', d)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={d === 0 ? 'Sub reminders off' : `${d} day lead`}
                        accessibilityState={{ selected: sel }}
                        style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8,
                          backgroundColor: sel ? F.coral : F.cream }}>
                        <Text style={{ color: sel ? '#fff' : F.ink2, fontSize: 12, fontWeight: '600' }}>
                          {d === 0 ? 'Off' : `${d}d`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              }/>
          </>
        )}
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
        textTransform: 'uppercase', marginBottom: 8 }}>Security</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        <Row icon="🔒" label="App lock"
          sub={lockEnabled
            ? 'Biometric or device PIN required on launch and resume'
            : 'Require biometric or device PIN to open Drift'}
          F={F}
          right={<Toggle value={lockEnabled} onChange={handleToggleLock} F={F}/>}/>
        {/* PS-21 — Privacy mask toggles. */}
        <Row icon="🕶️" label="Hide amounts when minimized"
          sub="Mask ₹ values to ₹••• in the task switcher view"
          F={F}
          right={<Toggle value={!!settings.privacy_hide_on_minimize}
            onChange={(v) => setSetting('privacy_hide_on_minimize', v ? 1 : 0)} F={F}/>}/>
        <Row icon="🚫" label="Block screenshots"
          sub="Prevent screenshots, screen recording, and casting (requires app restart)"
          F={F}
          right={<Toggle value={!!settings.privacy_block_screenshots}
            onChange={(v) => setSetting('privacy_block_screenshots', v ? 1 : 0)} F={F}/>}/>
        <Row icon="•••" label="Mask amounts always"
          sub="Hide every ₹ value behind ₹••• until you toggle this off"
          F={F}
          right={<Toggle value={!!settings.privacy_mask_amounts_always}
            onChange={(v) => setSetting('privacy_mask_amounts_always', v ? 1 : 0)} F={F}/>}/>
      </View>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>More</Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden' }}>
        <Row icon="📤" label="Export your data" sub="CSV, JSON, or PDF · choose a date range" F={F}
          onPress={() => navigation.navigate('Export')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🎯" label="Budget setup" sub="Tune budgets across all categories" F={F}
          onPress={() => navigation.navigate('BudgetSetup')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🧷" label="Quick templates" sub="1-tap saved expenses" F={F}
          onPress={() => navigation.navigate('QuickTemplates')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🗂️" label="Manage categories" F={F}
          onPress={() => navigation.navigate('EditPot')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🏷️" label="Manage tags" sub="Rename, merge, or delete" F={F}
          onPress={() => navigation.navigate('ManageTags')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🏦" label="Manage EMIs" sub="Track loans with amortization" F={F}
          onPress={() => navigation.navigate('EMI')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="📈" label="Manage investments" sub="MF, equity, gold, FD, NPS, PPF" F={F}
          onPress={() => navigation.navigate('Holdings')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🛡️" label="Manage insurance" sub="Life, term, health, vehicle" F={F}
          onPress={() => navigation.navigate('Insurance')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🛣️" label="Manage FASTag" sub="Wallet balances + toll spend" F={F}
          onPress={() => navigation.navigate('FASTag')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="⛽" label="Manage vehicles" sub="Cars, bikes, and fuel history" F={F}
          onPress={() => navigation.navigate('Vehicles')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🥗" label="Manage pantry" sub="Track what you own and what's running low" F={F}
          onPress={() => navigation.navigate('Pantry')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="🔔" label="Manage price alerts" sub="Watch tracked items for jumps" F={F}
          onPress={() => navigation.navigate('PriceAlerts')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="👥" label="Manage people" sub="Splits + per-person balances" F={F}
          onPress={() => navigation.navigate('People')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="💡" label="Manage utilities" sub="Electricity, gas, internet, mobile" F={F}
          onPress={() => navigation.navigate('Utilities')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="📥" label="Import CSV statement" sub="HDFC, SBI, ICICI credit card" F={F}
          onPress={() => navigation.navigate('CsvImport')}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        {recentSearches.length > 0 && (
          <Row icon="🕘" label="Clear search history" sub={`${recentSearches.length} recent search${recentSearches.length === 1 ? '' : 'es'}`} F={F}
            onPress={handleClearSearches}
            right={<Text style={{ fontSize: 16, color: '#e55' }}>›</Text>}/>
        )}
        <Row icon="💾" label="Backup encrypted" sub="AES-256-GCM, share to Drive / Files" F={F}
          onPress={() => setBackupOpen(true)}
          right={<Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>}/>
        <Row icon="♻️" label="Restore from backup" sub="Replaces ALL current data" F={F}
          onPress={() => setRestoreOpen(true)}
          right={<Text style={{ fontSize: 16, color: '#e55' }}>›</Text>}/>
        <Row icon="🗑️" label="Reset all data" sub="Wipe profile + data" F={F}
          onPress={handleReset}
          right={<Text style={{ fontSize: 16, color: '#e55' }}>›</Text>}/>
      </View>

      <TouchableOpacity onPress={onFooterTap} activeOpacity={1} delayPressIn={0}
        accessibilityRole="text" accessibilityLabel="Drift version 1.0.0, 100 percent offline">
        <Text style={{ textAlign: 'center', fontSize: 11, color: F.ink3, marginTop: 24 }}>
          Drift v1.0.0 · 100% offline
        </Text>
      </TouchableOpacity>

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

      {/* 8.8 — Backup modal */}
      <Modal visible={backupOpen} animationType="slide" transparent
        onRequestClose={() => !backupBusy && setBackupOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: F.bg, padding: 24,
            borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ fontSize: 20, color: F.ink, marginBottom: 4 }}>Create encrypted backup</Text>
            <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 16 }}>
              Includes: database + all receipt images
            </Text>
            <TextInput
              value={backupPass}
              onChangeText={setBackupPass}
              placeholder="Passphrase (≥ 8 characters)"
              placeholderTextColor={F.ink3}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!backupBusy}
              style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
                backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 10 }}
            />
            <TextInput
              value={backupPassConfirm}
              onChangeText={setBackupPassConfirm}
              placeholder="Confirm passphrase"
              placeholderTextColor={F.ink3}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!backupBusy}
              style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
                backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 12 }}
            />
            <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#fff4e6',
              borderWidth: 1, borderColor: '#ffd6a0', marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: '#a05a00' }}>
                ⚠️ Lost passphrase = lost backup. Drift cannot recover it. Store it somewhere safe.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => !backupBusy && setBackupOpen(false)}
                disabled={backupBusy}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: F.surface,
                  borderWidth: 1, borderColor: F.line, alignItems: 'center', opacity: backupBusy ? 0.5 : 1 }}>
                <Text style={{ color: F.ink, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateBackup}
                disabled={backupBusy || backupPass.length < 8 || backupPass !== backupPassConfirm}
                style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: F.coral,
                  alignItems: 'center',
                  opacity: (backupBusy || backupPass.length < 8 || backupPass !== backupPassConfirm) ? 0.5 : 1 }}>
                {backupBusy
                  ? <ActivityIndicator color="#fff"/>
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Create backup</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 8.8 — Restore modal */}
      <Modal visible={restoreOpen} animationType="slide" transparent
        onRequestClose={() => !restoreBusy && setRestoreOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: F.bg, padding: 24,
            borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ fontSize: 20, color: F.ink, marginBottom: 4 }}>Restore from backup</Text>
            <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#fde8e8',
              borderWidth: 1, borderColor: '#f5b5b5', marginVertical: 12 }}>
              <Text style={{ fontSize: 12, color: '#a02020' }}>
                ⚠️ This will REPLACE all current data with the backup. Cannot be undone.
              </Text>
            </View>
            <TouchableOpacity onPress={handlePickRestoreFile} disabled={restoreBusy}
              style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
                backgroundColor: F.surface, marginBottom: 10, opacity: restoreBusy ? 0.5 : 1 }}>
              <Text style={{ fontSize: 14, color: F.ink }}>
                {restoreFile ? `📄 ${restoreFile.name}` : '📁 Pick backup file'}
              </Text>
            </TouchableOpacity>
            <TextInput
              value={restorePass}
              onChangeText={setRestorePass}
              placeholder="Passphrase"
              placeholderTextColor={F.ink3}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!restoreBusy}
              style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
                backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 12 }}
            />
            {restoreErr ? (
              <Text style={{ fontSize: 12, color: '#a02020', marginBottom: 12 }}>{restoreErr}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => !restoreBusy && setRestoreOpen(false)}
                disabled={restoreBusy}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: F.surface,
                  borderWidth: 1, borderColor: F.line, alignItems: 'center', opacity: restoreBusy ? 0.5 : 1 }}>
                <Text style={{ color: F.ink, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRunRestore}
                disabled={restoreBusy || !restoreFile || !restorePass}
                style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#e55',
                  alignItems: 'center',
                  opacity: (restoreBusy || !restoreFile || !restorePass) ? 0.5 : 1 }}>
                {restoreBusy
                  ? <ActivityIndicator color="#fff"/>
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>Restore</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default React.memo(Profile);
