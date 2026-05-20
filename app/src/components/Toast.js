import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

const DEFAULT_PASSIVE_MS = 2500;
const DEFAULT_ACTION_MS = 5000;
const ANIM_MS = 220;

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);
  const show = useCallback((text, opts = {}) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage({
      text: String(text),
      id: Date.now(),
      actionLabel: opts.actionLabel || null,
      onAction: opts.onAction || null,
      durationMs: opts.durationMs || (opts.actionLabel ? DEFAULT_ACTION_MS : DEFAULT_PASSIVE_MS),
    });
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ToastBanner
        message={message}
        onDismiss={() => setMessage(null)}
        registerTimer={(t) => { timerRef.current = t; }}
      />
    </ToastContext.Provider>
  );
}

function ToastBanner({ message, onDismiss, registerTimer }) {
  const { F } = useApp();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!message) return;
    translateY.value = withTiming(0, { duration: ANIM_MS });
    opacity.value = withTiming(1, { duration: ANIM_MS });
    const t = setTimeout(() => {
      translateY.value = withTiming(-80, { duration: ANIM_MS });
      opacity.value = withTiming(0, { duration: ANIM_MS }, (done) => {
        if (done) runOnJS(onDismiss)();
      });
    }, message.durationMs);
    registerTimer(t);
    return () => clearTimeout(t);
  }, [message?.id]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!message) return null;

  const hasAction = !!(message.actionLabel && message.onAction);

  return (
    <Animated.View
      pointerEvents={hasAction ? 'box-none' : 'none'}
      style={[
        {
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          right: 16,
          backgroundColor: F.ink,
          borderRadius: 14,
          paddingVertical: 12,
          paddingHorizontal: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 12,
          elevation: 6,
        },
        animStyle,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ color: F.sage, fontSize: 16, fontWeight: '700' }}>✓</Text>
        <Text style={{ color: F.bg, fontSize: 14, fontWeight: '500', flex: 1 }}>
          {message.text}
        </Text>
        {hasAction && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={message.actionLabel}
            onPress={() => {
              try { message.onAction(); } finally { onDismiss(); }
            }}
            hitSlop={8}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Text style={{ color: F.coral, fontSize: 13, fontWeight: '700' }}>
              {message.actionLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}
