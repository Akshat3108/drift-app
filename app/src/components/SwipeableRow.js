import React, { useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

let ReanimatedSwipeable = null;
try {
  ReanimatedSwipeable = require('react-native-gesture-handler/ReanimatedSwipeable').default;
} catch {
  ReanimatedSwipeable = null;
}

const ACTION_WIDTH = 84;

export default function SwipeableRow({
  children,
  rightLabel = 'Delete',
  rightIcon = '🗑',
  rightColor,
  onRightAction,
  enabled = true,
  F,
}) {
  const swipeRef = useRef(null);

  if (!enabled || !ReanimatedSwipeable || !onRightAction) {
    return <View>{children}</View>;
  }

  const bg = rightColor || F?.coral || '#e55';

  const renderRightActions = () => (
    <TouchableOpacity
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={rightLabel}
      onPress={() => {
        swipeRef.current?.close?.();
        onRightAction();
      }}
      style={{
        width: ACTION_WIDTH,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 20, color: '#fff' }}>{rightIcon}</Text>
      <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700', marginTop: 4 }}>
        {rightLabel}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={ACTION_WIDTH * 0.6}
      overshootRight={false}
      renderRightActions={renderRightActions}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
