// 8.3 — memoised row for AllExpenses' SectionList. Extracted from the
// inline JSX block in AllExpenses.js. All event handlers are received as
// stable props (parent useCallback'd) and called with the expense id /
// merchant — keeps re-renders bounded to the row whose props actually
// changed.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { potBg } from '../../../theme';
import { PAYMENT_EMOJI } from '@features/expenses/filters';
import { pickReceiptUri } from '@features/expenses/receiptUri';
import { DriftImage } from '@components/DriftImage';
import SwipeableRow from '@components/SwipeableRow';

function ExpenseRow({
  expense,
  F,
  sym,
  isFirst,
  isLast,
  isSelected,
  selectionMode,
  showThumb,        // PS-46 — opt-in receipt thumbnail in place of the emoji
  onPress,
  onLongPress,
  onSwipeDelete,
}) {
  // PS-46 — when enabled, a receipt-bearing row shows its 320px thumbnail in
  // the category-emoji slot. Selection mode always wins (shows the ✓ tick).
  const thumbUri = showThumb ? pickReceiptUri(expense).thumb : null;
  // 8.1 — each row carries its own card-edge borders since SectionList's
  // per-section data can't be wrapped in an outer rounded container without
  // breaking virtualisation. Visual stays identical to the original wrapped
  // <View borderRadius: 18, borderWidth: 1>.
  return (
    <SwipeableRow
      F={F}
      enabled={!selectionMode}
      onRightAction={() => onSwipeDelete(expense.id, expense.merchant)}
    >
      <TouchableOpacity
        onPress={() => onPress(expense.id)}
        onLongPress={() => onLongPress(expense.id)}
        delayLongPress={250}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
          backgroundColor: isSelected ? F.cream : F.surface,
          borderLeftWidth: isSelected ? 4 : 1,
          borderLeftColor: isSelected ? F.coral : F.line,
          borderRightWidth: 1, borderRightColor: F.line,
          borderTopWidth: 1, borderTopColor: F.line,
          borderBottomWidth: isLast ? 1 : 0, borderBottomColor: F.line,
          borderTopLeftRadius: isFirst ? 18 : 0,
          borderTopRightRadius: isFirst ? 18 : 0,
          borderBottomLeftRadius: isLast ? 18 : 0,
          borderBottomRightRadius: isLast ? 18 : 0,
        }}>
        <View style={{
          width: 42, height: 42, borderRadius: 13,
          backgroundColor: potBg(F, expense.category_color || 'cream'),
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {isSelected ? (
            <Text style={{ fontSize: 20 }}>✓</Text>
          ) : thumbUri ? (
            <DriftImage source={{ uri: thumbUri }} recyclingKey={thumbUri}
              style={{ width: 42, height: 42, borderRadius: 13 }} />
          ) : (
            <Text style={{ fontSize: 20 }}>{expense.category_emoji || '💰'}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>
            {expense.merchant}
          </Text>
          <Text style={{ fontSize: 12, color: F.ink2 }}>
            {expense.payment_method ? `${PAYMENT_EMOJI[expense.payment_method] || ''} ` : ''}
            {expense.category_name || 'Uncategorised'}
            {expense.mood ? `  ${expense.mood}` : ''}
            {expense.recurring ? '  · recurring' : ''}
          </Text>
        </View>
        <Text style={{ fontSize: 16, color: F.ink }}>
          −{sym}{expense.amount.toFixed(2)}
        </Text>
      </TouchableOpacity>
    </SwipeableRow>
  );
}

export default React.memo(ExpenseRow);
