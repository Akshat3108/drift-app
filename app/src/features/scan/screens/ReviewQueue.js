// PS-38 — OCR review queue. Lists scanned expenses the parser wasn't confident
// about (overall confidence < 0.6) or that saved with a receipt but no line
// items. Tap a row → Detail (receipt + items visible); "Fix items" jumps
// straight to EditExpense. Re-fetches on focus so a row drops off the list once
// the user corrects it. Reads the repo directly (not the capped in-memory feed)
// because flagged scans can sit beyond the 500-row window and need item_count.

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { expenses as expRepo } from '@features/expenses/repo';

// Confidence → {label, palette key} for the per-row chip. NULL means the row
// was flagged purely for having no items (legacy or empty scan), so we show a
// neutral "No items" tag instead of a percentage.
function confidenceChip(row, F) {
  const c = row.ocr_confidence;
  if (c == null) {
    return { text: 'No items', bg: F.cream, fg: F.ink2, border: F.line };
  }
  const pct = Math.round(c * 100);
  if (c < 0.4)  return { text: `⚠ ${pct}%`, bg: '#fde4e1', fg: '#a13a2a', border: '#f0a89e' };
  return { text: `! ${pct}%`, bg: '#fff4d9', fg: '#7a5a14', border: '#e9c46a' };
}

function ReviewQueue({ navigation }) {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState(null); // null = loading, [] = empty

  const load = useCallback(async () => {
    try { setRows(await expRepo.reviewQueue({ limit: 100 })); }
    catch { setRows([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

      <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 16, paddingHorizontal: 4 }}>
        Scans the reader wasn't sure about. Tap to check the receipt, or fix the
        items directly.
      </Text>

      {rows == null && (
        <Text style={{ textAlign: 'center', color: F.ink3, padding: 40 }}>Loading…</Text>
      )}

      {rows != null && rows.length === 0 && (
        <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
          borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>✓</Text>
          <Text style={{ fontSize: 15, color: F.ink2 }}>Nothing to review</Text>
          <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
            Confident scans don't show up here. A receipt lands in this list when
            its confidence is low or it saved without any items.
          </Text>
        </View>
      )}

      {rows != null && rows.map((e) => {
        const chip = confidenceChip(e, F);
        return (
          <View key={e.id} style={{ backgroundColor: F.surface, borderRadius: 18,
            borderWidth: 1, borderColor: F.line, marginBottom: 10, overflow: 'hidden' }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Detail', { id: e.id })}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: F.cream,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>{e.category_emoji || '🧾'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }} numberOfLines={1}>
                  {e.merchant}
                </Text>
                <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                  {e.expense_date} · {e.item_count} item{e.item_count === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={{ fontSize: 14, color: F.ink }}>{sym}{Number(e.amount).toFixed(2)}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                  backgroundColor: chip.bg, borderWidth: 1, borderColor: chip.border }}>
                  <Text style={{ fontSize: 11, color: chip.fg, fontWeight: '600' }}>{chip.text}</Text>
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditExpense', { id: e.id })}
              activeOpacity={0.7}
              style={{ paddingVertical: 11, alignItems: 'center',
                borderTopWidth: 1, borderTopColor: F.line, backgroundColor: F.bg }}>
              <Text style={{ fontSize: 13, color: F.coral, fontWeight: '600' }}>Fix items</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default React.memo(ReviewQueue);
