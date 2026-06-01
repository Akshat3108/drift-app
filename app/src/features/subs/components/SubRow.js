// 8.3 — memoised subscription row for Subs' FlatList. Extracted from the
// inline JSX in Subs.js:205-285. Wraps SwipeableRow with edit + cancel +
// reinstate affordances. All callbacks are stable (parent useCallback'd)
// and receive the sub id as their argument.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import SwipeableRow from '@components/SwipeableRow';

function SubRow({
  sub,
  F,
  sym,
  drift,           // PS-29 — {delta_amount, delta_pct, actual_avg} when charged price drifted
  onPress,
  onLongPress,
  onCancel,
  onReinstate,
  onEdit,
  onSwipeDelete,
}) {
  const vcolor = sub.cancelled
    ? F.ink3
    : sub.verdict === 'cancel' ? F.coral
    : sub.verdict === 'review' ? F.warn
    : F.sageD;
  const vbg = sub.cancelled
    ? F.surface
    : sub.verdict === 'cancel' ? '#fde2dc'
    : sub.verdict === 'review' ? '#fdf0d4'
    : F.mint;

  return (
    <SwipeableRow F={F} onRightAction={() => onSwipeDelete(sub.id, sub.name)}>
      <TouchableOpacity
        onLongPress={() => onLongPress(sub.id, sub.name)}
        onPress={() => onPress(sub.id)}
        activeOpacity={0.85}
        style={{
          backgroundColor: F.surface, borderRadius: 18,
          padding: 14, marginBottom: 10,
          flexDirection: 'row', alignItems: 'center', gap: 12,
          borderWidth: 1, borderColor: F.line,
          opacity: sub.cancelled ? 0.5 : 1,
        }}
      >
        <View style={{
          width: 42, height: 42, borderRadius: 13, backgroundColor: sub.color,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 20 }}>{sub.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: 14, fontWeight: '600', color: F.ink,
            textDecorationLine: sub.cancelled ? 'line-through' : 'none',
          }}>{sub.name}</Text>
          <Text style={{ fontSize: 12, color: F.ink2 }}>
            {sub.cancelled ? 'Cancelled' : (sub.used_freq || `${sym}${sub.amount.toFixed(2)}/${sub.period}`)}
          </Text>
          {/* PS-29 — charged price drifted from the set amount. */}
          {!sub.cancelled && drift && (
            <View style={{ alignSelf: 'flex-start', marginTop: 4, borderRadius: 99,
              paddingHorizontal: 8, paddingVertical: 2,
              backgroundColor: drift.delta_amount > 0 ? '#fde2dc' : F.mint }}>
              <Text style={{ fontSize: 10, fontWeight: '700',
                color: drift.delta_amount > 0 ? F.coral : F.sageD }}>
                {drift.delta_amount > 0 ? '↑ price up ' : '↓ price down '}
                {drift.delta_amount > 0 ? '+' : '−'}{sym}{Math.abs(Math.round(drift.delta_amount))}/{sub.period}
              </Text>
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={{ fontSize: 16, color: F.ink }}>{sym}{sub.amount.toFixed(2)}</Text>
          <View style={{
            backgroundColor: vbg, borderRadius: 99,
            paddingHorizontal: 8, paddingVertical: 3,
          }}>
            <Text style={{ color: vcolor, fontSize: 10, fontWeight: '700' }}>
              {sub.cancelled ? 'done' : sub.verdict}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              onPress={() => onEdit(sub.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${sub.name}`}
              style={{ paddingHorizontal: 2, paddingVertical: 2 }}
            >
              <Text style={{ color: F.coral, fontSize: 11, fontWeight: '600' }}>Edit</Text>
            </TouchableOpacity>
            <Text style={{ color: F.ink3, fontSize: 11 }}>·</Text>
            {!sub.cancelled ? (
              <TouchableOpacity
                onPress={() => onCancel(sub.id, sub.name)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${sub.name} cancelled`}
                style={{ paddingHorizontal: 2, paddingVertical: 2 }}
              >
                <Text style={{ color: '#e55', fontSize: 11, fontWeight: '600' }}>Mark cancelled</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => onReinstate(sub.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Reinstate ${sub.name}`}
                style={{ paddingHorizontal: 2, paddingVertical: 2 }}
              >
                <Text style={{ color: F.coral, fontSize: 11, fontWeight: '600' }}>Reinstate</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </SwipeableRow>
  );
}

export default React.memo(SubRow);
