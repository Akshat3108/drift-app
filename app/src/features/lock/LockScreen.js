// 8.11 — Lock overlay. Sits on top of the navigation tree while LockGate
// holds `locked=true`. Auto-fires authenticate() once on mount; on cancel /
// fail the user gets a single big "Unlock" button to retry. No exit
// affordance — matches banking-app convention; the user can background the
// app themselves if they want out.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../core/theme/ThemeContext';

export default function LockScreen({ onAuthenticate }) {
  const { F } = useTheme();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState('idle');  // 'idle' | 'pending' | 'failed'
  const [hint, setHint] = useState('');
  const firedRef = useRef(false);

  const tryAuth = async () => {
    setPhase('pending');
    setHint('');
    const res = await onAuthenticate();
    if (res?.success) {
      // Gate will flip locked=false and unmount this overlay — no further
      // state changes needed here.
      return;
    }
    setPhase('failed');
    if (res?.cancelled) setHint('Authentication cancelled');
    else if (res?.error === 'native_module_missing') setHint('Lock unavailable — rebuild the app');
    else setHint('Authentication failed. Try again.');
  };

  // Auto-fire once on first mount. React StrictMode would call this twice in
  // dev; the firedRef guard keeps that single-shot.
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    tryAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: F.bg,
      alignItems: 'center', justifyContent: 'center',
      paddingTop: insets.top, paddingBottom: insets.bottom,
      paddingHorizontal: 32,
    }}>
      <View style={{
        width: 96, height: 96, borderRadius: 48, backgroundColor: F.cream,
        alignItems: 'center', justifyContent: 'center', marginBottom: 24,
      }}>
        <Text style={{ fontSize: 44 }}>🔒</Text>
      </View>
      <Text style={{ fontSize: 22, color: F.ink, fontWeight: '600', marginBottom: 6 }}>
        Drift is locked
      </Text>
      <Text style={{ fontSize: 13, color: F.ink3, textAlign: 'center', marginBottom: 28 }}>
        Use your fingerprint, face, or device PIN to continue.
      </Text>

      {phase === 'pending' ? (
        <ActivityIndicator size="large" color={F.coral} />
      ) : (
        <TouchableOpacity onPress={tryAuth}
          accessibilityRole="button"
          accessibilityLabel="Unlock Drift"
          style={{
            backgroundColor: F.coral, paddingVertical: 14, paddingHorizontal: 36,
            borderRadius: 14, minWidth: 200, alignItems: 'center',
          }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Unlock</Text>
        </TouchableOpacity>
      )}

      {hint ? (
        <Text style={{ fontSize: 12, color: F.ink3, marginTop: 16, textAlign: 'center' }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
