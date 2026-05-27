// 8.3 — memoised category row for Trends' FlatList. Extracted from the
// inline JSX in Trends.js:188-243. Renders the per-category progress strip
// inside the "Spending by category" card. Caller computes prevSpent/delta
// once per render of the parent and passes them in (so this component stays
// a pure projection of its props).

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ProgressBar } from '@components/primitives/ProgressBar';

function CategoryRow({
  pot,
  F,
  sym,
  palColor,
  deltaInfo,
  compareLabel,
  prevSpent,
  onPress,
}) {
  const pct = pot.budget > 0 ? pot.spend / pot.budget : 0;
  const over = pct > 1;
  return (
    <TouchableOpacity
      onPress={() => onPress(pot.id, pot.emoji, pot.label)}
      activeOpacity={0.7}
      style={{ borderTopWidth: 1, borderTopColor: F.line, padding: 16 }}
    >
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
      }}>
        <View style={{
          width: 10, height: 10, borderRadius: 5, backgroundColor: palColor, flexShrink: 0,
        }} />
        <Text style={{ fontSize: 16 }}>{pot.emoji}</Text>
        <Text style={{ flex: 1, fontSize: 14, color: F.ink, fontWeight: '500' }}>
          {pot.label}
        </Text>
        <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>
          {sym}{pot.spend.toFixed(0)}
        </Text>
        {over && (
          <View style={{
            backgroundColor: '#fde2dc', borderRadius: 99,
            paddingHorizontal: 7, paddingVertical: 2,
          }}>
            <Text style={{ fontSize: 10, color: F.coral, fontWeight: '700' }}>⚠ over</Text>
          </View>
        )}
        <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
      </View>
      {pot.budget > 0 && (
        <>
          <ProgressBar
            value={pot.spend} max={pot.budget}
            color={over ? F.coral : palColor} F={F} height={6}
          />
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', marginTop: 6,
          }}>
            <Text style={{ fontSize: 11, color: F.ink3 }}>
              {Math.round(pct * 100)}% of {sym}{pot.budget} budget
            </Text>
            <Text style={{ fontSize: 11, color: over ? F.coral : F.sageD }}>
              {over
                ? `⚠ ${sym}${(pot.spend - pot.budget).toFixed(0)} over`
                : `✓ ${sym}${(pot.budget - pot.spend).toFixed(0)} left`}
            </Text>
          </View>
        </>
      )}
      {deltaInfo && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
        }}>
          <Text style={{
            fontSize: 11,
            color: deltaInfo.direction === 'up' ? F.coral
                 : deltaInfo.direction === 'down' ? F.sageD : F.ink3,
            fontWeight: '600',
          }}>
            {deltaInfo.direction === 'up' ? '↑' : deltaInfo.direction === 'down' ? '↓' : '·'}
            {' '}{Math.abs(deltaInfo.pct).toFixed(0)}%
          </Text>
          <Text style={{ fontSize: 11, color: F.ink3 }}>
            vs {compareLabel} ({sym}{Number(prevSpent || 0).toFixed(0)})
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default React.memo(CategoryRow);
