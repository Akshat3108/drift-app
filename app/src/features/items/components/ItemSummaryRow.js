// 8.3 — memoised row for Items.js FlatList. Extracted from the inline JSX
// in Items.js:121-167. SparkBars is the only nested primitive; its data
// reference is stable per-row (set when load() resolves), so memo works.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SparkBars } from '@components/primitives/SparkBars';

const KIND_EMOJI = { produce: '🥬', grocery: '🛒', other: '📦' };

function ItemSummaryRow({ item, F, sym, onPress }) {
  return (
    <TouchableOpacity
      onPress={() => onPress(item.normalized_name, item.display_name)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={
        `${item.display_name}, ${sym}${item.last_unit_price.toFixed(2)} per ${item.canonical_unit}` +
        (item.change_pct !== null
          ? `, ${item.change_pct > 0 ? 'up' : 'down'} ${Math.abs(item.change_pct).toFixed(0)} percent`
          : '')
      }
      style={{
        backgroundColor: F.surface, borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: F.line, marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 46, height: 46, borderRadius: 14, backgroundColor: F.cream,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 22 }}>{KIND_EMOJI[item.kind] || '📦'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: 15, color: F.ink, fontWeight: '600',
            textTransform: 'capitalize',
          }}>
            {item.display_name}
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 2 }}>
            {sym}{item.last_unit_price.toFixed(2)}/{item.canonical_unit}
            {item.change_pct !== null && (
              <Text style={{
                color: item.change_pct > 0 ? F.coral : F.sageD,
                fontWeight: '700',
              }}>
                {' '}{item.change_pct > 0 ? '↑' : '↓'} {Math.abs(item.change_pct).toFixed(0)}%
              </Text>
            )}
          </Text>
        </View>
        <View style={{ width: 64, height: 28 }}>
          {item.spark?.length > 1 && (
            <SparkBars data={item.spark} color={F.coral} F={F} height={28} />
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{
          backgroundColor: F.mint, borderRadius: 99,
          paddingHorizontal: 10, paddingVertical: 4,
        }}>
          <Text style={{ fontSize: 11, color: F.sageD, fontWeight: '600' }}>
            {item.total_qty_30d.toFixed(item.canonical_unit === 'pcs' ? 0 : 2)} {item.canonical_unit} this month
          </Text>
        </View>
        <View style={{
          backgroundColor: F.cream, borderRadius: 99,
          paddingHorizontal: 10, paddingVertical: 4,
        }}>
          <Text style={{ fontSize: 11, color: F.ink2, fontWeight: '600' }}>
            {item.points_count} buy{item.points_count === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(ItemSummaryRow);
