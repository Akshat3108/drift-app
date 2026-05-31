// 8.3 — memoised expense row for PotDetail's SectionList. Different from
// expenses/ExpenseRow because PotDetail renders carbon kg + recurring badge
// (not text) + the pot's emoji (not the expense's category emoji), and has
// no selection-mode. Kept as a separate component rather than parameterising
// ExpenseRow because the two looks diverge in too many places.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { potBg } from '../../../theme';
import { pickReceiptUri } from '@features/expenses/receiptUri';
import { DriftImage } from '@components/DriftImage';

function PotExpenseRow({ expense, F, sym, pot, isFirst, isLast, showThumb, onPress }) {
  // PS-46 — opt-in receipt thumbnail in place of the pot emoji.
  const thumbUri = showThumb ? pickReceiptUri(expense).thumb : null;
  // 8.2 — per-row card-edge borders matching ExpenseRow's pattern. Mirrors
  // PotDetail's original wrapped-card visual (borderRadius: 20).
  return (
    <TouchableOpacity
      onPress={() => onPress(expense.id)}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
        backgroundColor: F.surface,
        borderLeftWidth: 1, borderLeftColor: F.line,
        borderRightWidth: 1, borderRightColor: F.line,
        borderTopWidth: 1, borderTopColor: F.line,
        borderBottomWidth: isLast ? 1 : 0, borderBottomColor: F.line,
        borderTopLeftRadius: isFirst ? 20 : 0,
        borderTopRightRadius: isFirst ? 20 : 0,
        borderBottomLeftRadius: isLast ? 20 : 0,
        borderBottomRightRadius: isLast ? 20 : 0,
      }}
    >
      <View style={{
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: potBg(F, pot.color),
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {thumbUri ? (
          <DriftImage source={{ uri: thumbUri }} recyclingKey={thumbUri}
            style={{ width: 44, height: 44, borderRadius: 14 }} />
        ) : (
          <Text style={{ fontSize: 20 }}>{pot.emoji}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: F.ink }}>{expense.merchant}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {expense.mood && <Text style={{ fontSize: 13 }}>{expense.mood}</Text>}
          {expense.recurring && (
            <View style={{ backgroundColor: F.lilac, borderRadius: 99,
              paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10, color: F.ink2, fontWeight: '600' }}>recurring</Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 17, color: F.ink, fontWeight: '500' }}>
          −{sym}{expense.amount.toFixed(2)}
        </Text>
        {expense.carbon ? (
          <Text style={{ fontSize: 11, color: F.sageD }}>
            {expense.carbon} kg CO₂
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(PotExpenseRow);
