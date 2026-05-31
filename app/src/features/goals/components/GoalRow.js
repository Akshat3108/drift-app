// 8.3 — memoised goal row for Goals' FlatList. Extracted from the inline
// JSX in Goals.js:91-135. Colour rotation derived from the index; parent
// owns the bg / color tables and passes the picked values in.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ProgressBar } from '@components/primitives/ProgressBar';

const STATUS_LABEL = { on_track: 'On track', behind: 'Behind', ahead: 'Ahead' };

function GoalRow({ goal, F, sym, bg, color, projection, onPress, onLongPress }) {
  const pct = goal.target_amount > 0 ? goal.saved_amount / goal.target_amount : 0;
  // PS-44 — projected ETA line. `behind` reads coral; `ahead`/`on_track` read
  // sage; an unparseable target eta leaves status null → neutral "Projected".
  const statusColor = projection
    ? (projection.status === 'behind' ? F.coral
       : projection.status ? F.sageD : F.ink3)
    : null;
  const statusLabel = projection ? (STATUS_LABEL[projection.status] || 'Projected') : null;
  return (
    <TouchableOpacity
      onPress={() => onPress(goal.id)}
      onLongPress={() => onLongPress(goal.id)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={
        `${goal.name}: ${Math.round(pct * 100)} percent saved, ` +
        `${sym}${goal.saved_amount.toLocaleString()} of ${sym}${goal.target_amount.toLocaleString()}. ` +
        'Double tap to contribute, long-press for more.'
      }
      style={{
        backgroundColor: bg, borderRadius: 22, padding: 18, marginBottom: 12,
      }}
    >
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 12,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 14, backgroundColor: F.surface,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 24 }}>{goal.emoji}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 18, color: F.ink }}>{goal.name}</Text>
            {goal.eta && <Text style={{ fontSize: 12, color: F.ink3 }}>ETA: {goal.eta}</Text>}
          </View>
        </View>
        <Text style={{ fontSize: 26, color, fontWeight: '400' }}>
          {Math.round(pct * 100)}%
        </Text>
      </View>
      <ProgressBar value={goal.saved_amount} max={goal.target_amount} color={color} F={F} height={8} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={{ fontSize: 13, color: F.ink2 }}>
          <Text style={{ color: F.ink, fontWeight: '600' }}>
            {sym}{goal.saved_amount.toLocaleString()}
          </Text> saved
        </Text>
        <Text style={{ fontSize: 13, color: F.ink3 }}>
          {sym}{Math.max(0, goal.target_amount - goal.saved_amount).toLocaleString()} to go
        </Text>
      </View>
      {projection && (projection.reached || projection.eta_iso) && (
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: F.surface, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10 }}>
          <Text style={{ fontSize: 11, color: statusColor, fontWeight: '700' }}>{statusLabel}</Text>
          <Text style={{ fontSize: 11, color: F.ink2 }}>
            {projection.reached
              ? 'Goal reached 🎉'
              : `${projection.eta_iso.slice(0, 7)} · ${sym}${projection.monthly_velocity.toLocaleString('en-IN')}/mo`}
          </Text>
        </View>
      )}
      <Text style={{ fontSize: 11, color: F.ink3, marginTop: 6, textAlign: 'center' }}>
        tap to contribute · long-press for more
      </Text>
    </TouchableOpacity>
  );
}

export default React.memo(GoalRow);
