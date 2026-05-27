// 5.13 — Full-screen pan/zoom Modal for a single receipt image.
// 5.15 — Owns the lazy-migrate trigger: when opened on a row that still has
// receipt_uri but no receipt_path, copy the cache image into permanent
// storage and stamp the v7 path columns. Silent failure: a broken cache URI
// keeps rendering as-is, and re-attach can ship as a future feature.
//
// Gestures: pinch and pan composed via Gesture.Simultaneous, double-tap
// toggles 1x ↔ 2x. Scale bounded [1, 4]; pan clamped against the
// (scale - 1) * dim / 2 envelope so the image can't leave the canvas.
//
// All RNGH + Reanimated imports are lazy so the rest of the app keeps
// loading if a dev hasn't rebuilt against the native shell.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Image, Dimensions, ActivityIndicator } from 'react-native';
import { useTheme } from '@core/theme/ThemeContext';
import { persistReceipt } from '@media/receipts';
import { expenses as expRepo } from '@features/expenses/repo';
import { pickReceiptUri, needsMigration } from '@features/expenses/receiptUri';
import { logError } from '@core/utils/log';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SNAP_BACK = 1.05;
const DOUBLE_TAP_SCALE = 2;

// Lazy require so Metro doesn't error on shells missing the native side.
function loadGestureModules() {
  try {
    const rngh = require('react-native-gesture-handler');
    const r = require('react-native-reanimated');
    return {
      GestureDetector: rngh.GestureDetector,
      Gesture: rngh.Gesture,
      Animated: r.default,
      useSharedValue: r.useSharedValue,
      useAnimatedStyle: r.useAnimatedStyle,
      withTiming: r.withTiming,
      runOnJS: r.runOnJS,
    };
  } catch (e) {
    logError('ReceiptViewer:gestureLoad', e);
    return null;
  }
}

export default function ReceiptViewer({ visible, expense, onClose, onMigrated }) {
  const { F } = useTheme();
  const { width: winW, height: winH } = Dimensions.get('window');
  // Local shadow of the expense row so lazy-migrate updates re-render the
  // image inside the viewer without bouncing through the provider.
  const [row, setRow] = useState(expense);
  useEffect(() => { setRow(expense); }, [expense?.id, expense?.receipt_path, expense?.receipt_uri, expense?.receipt_thumb]);

  const [migrating, setMigrating] = useState(false);

  const { full } = useMemo(() => pickReceiptUri(row), [row]);

  // 5.15 — lazy-migrate hook. Runs once per open of a legacy-only row.
  useEffect(() => {
    if (!visible) return;
    if (!row || !needsMigration(row)) return;
    let cancelled = false;
    (async () => {
      setMigrating(true);
      try {
        // 8.6 — pass the row's expense_date so the lazy-migrated WebP files
        // land in the same yyyy/mm partition as same-month fresh scans.
        const stored = await persistReceipt(row.receipt_uri, { expenseDate: row.expense_date });
        if (cancelled || !stored) return;
        await expRepo.attachReceiptStorage(row.id, stored);
        if (cancelled) return;
        const next = {
          ...row,
          receipt_path:       stored.path,
          receipt_thumb:      stored.thumb,
          receipt_bytes:      stored.bytes,
          receipt_image_hash: stored.imageHash,
        };
        setRow(next);
        onMigrated?.(next);
      } catch (e) {
        logError('ReceiptViewer:migrate', e);
      } finally {
        if (!cancelled) setMigrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mods = useMemo(() => loadGestureModules(), []);
  if (!mods) {
    // Static fallback: contain-fit Image + close button. Pinch unavailable
    // until the dev rebuilds, but the viewer still works.
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <StaticBackdrop F={F} onClose={onClose}>
          {full ? (
            <Image source={{ uri: full }} resizeMode="contain"
              style={{ width: winW, height: winH * 0.85 }}/>
          ) : <EmptyState F={F}/>}
        </StaticBackdrop>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }}>
        {full ? (
          <ZoomableImage uri={full} winW={winW} winH={winH} mods={mods}/>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 14 }}>No receipt attached.</Text>
          </View>
        )}

        {migrating && (
          <View style={{ position: 'absolute', top: 60, alignSelf: 'center',
            flexDirection: 'row', gap: 8, backgroundColor: 'rgba(0,0,0,0.6)',
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}>
            <ActivityIndicator color="#fff" size="small"/>
            <Text style={{ color: '#fff', fontSize: 12 }}>Saving permanently…</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.8}
          style={{ position: 'absolute', top: 44, right: 16,
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>×</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function ZoomableImage({ uri, winW, winH, mods }) {
  const { GestureDetector, Gesture, Animated, useSharedValue, useAnimatedStyle, withTiming } = mods;

  const scale = useSharedValue(1);
  const savedScale = useRef(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useRef(0);
  const savedTy = useRef(0);

  // Pan envelope: image extends past viewport by (s-1)/2 in each axis.
  const clampTranslation = (s, x, y) => {
    'worklet';
    const maxX = (winW * (s - 1)) / 2;
    const maxY = (winH * (s - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.current * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      'worklet';
      if (scale.value < SNAP_BACK) {
        scale.value = withTiming(1, { duration: 160 });
        tx.value = withTiming(0, { duration: 160 });
        ty.value = withTiming(0, { duration: 160 });
        savedScale.current = 1;
        savedTx.current = 0;
        savedTy.current = 0;
      } else {
        savedScale.current = scale.value;
        const clamped = clampTranslation(scale.value, tx.value, ty.value);
        tx.value = withTiming(clamped.x, { duration: 120 });
        ty.value = withTiming(clamped.y, { duration: 120 });
        savedTx.current = clamped.x;
        savedTy.current = clamped.y;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      'worklet';
      if (scale.value <= SNAP_BACK) return;
      const clamped = clampTranslation(scale.value, savedTx.current + e.translationX, savedTy.current + e.translationY);
      tx.value = clamped.x;
      ty.value = clamped.y;
    })
    .onEnd(() => {
      'worklet';
      savedTx.current = tx.value;
      savedTy.current = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      if (scale.value > SNAP_BACK) {
        scale.value = withTiming(1, { duration: 160 });
        tx.value = withTiming(0, { duration: 160 });
        ty.value = withTiming(0, { duration: 160 });
        savedScale.current = 1;
        savedTx.current = 0;
        savedTy.current = 0;
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 160 });
        savedScale.current = DOUBLE_TAP_SCALE;
      }
    });

  const composed = Gesture.Simultaneous(pinch, Gesture.Race(doubleTap, pan));

  const aStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, aStyle]}>
        <Image source={{ uri }} resizeMode="contain"
          style={{ width: winW, height: winH }}/>
      </Animated.View>
    </GestureDetector>
  );
}

function StaticBackdrop({ F, onClose, children }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
      alignItems: 'center', justifyContent: 'center' }}>
      {children}
      <TouchableOpacity onPress={onClose} activeOpacity={0.8}
        style={{ position: 'absolute', top: 44, right: 16,
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: 'rgba(255,255,255,0.18)',
          alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyState({ F }) {
  return <Text style={{ color: '#fff', fontSize: 14 }}>No receipt attached.</Text>;
}
