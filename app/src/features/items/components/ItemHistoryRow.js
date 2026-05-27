// 8.3 — memoised history row for ItemTrend's History FlatList. Extracted
// from the inline JSX in ItemTrend.js:444-470 (the bottom-of-screen list
// of all purchases for this item, newest first).

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

function ItemHistoryRow({ entry, F, sym, isFirst, isLast, onPress }) {
  // 8.2 — per-row card-edge borders so the rounded-card visual stays
  // continuous without an outer wrap (which would defeat FlatList
  // virtualisation). Mirrors ExpenseRow's pattern.
  return (
    <TouchableOpacity
      onPress={() => onPress(entry.expense_id)}
      activeOpacity={0.7}
      style={{
        padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: F.surface,
        borderLeftWidth: 1, borderLeftColor: F.line,
        borderRightWidth: 1, borderRightColor: F.line,
        borderTopWidth: 1, borderTopColor: F.line,
        borderBottomWidth: isLast ? 1 : 0, borderBottomColor: F.line,
        borderTopLeftRadius: isFirst ? 18 : 0,
        borderTopRightRadius: isFirst ? 18 : 0,
        borderBottomLeftRadius: isLast ? 18 : 0,
        borderBottomRightRadius: isLast ? 18 : 0,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: F.ink, fontWeight: '500' }}>
          {entry.merchant || 'Unknown store'}
        </Text>
        <Text style={{ fontSize: 11, color: F.ink3 }}>
          {entry.purchase_date} · {entry.qty} {entry.unit}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>
          {sym}{entry.price.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 11, color: F.coral }}>
          {sym}{entry.unit_price.toFixed(2)}/{entry.canonical_unit}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(ItemHistoryRow);
