// PS-30 — pending recurring-debit queue. Lists auto-created (is_pending=1)
// expenses the daily maintenance task projected; the user confirms (→ becomes a
// live expense, enters rollups via the v54 AU trigger) or dismisses (hard
// delete). Reachable from the Home "N to confirm" pill. Re-fetches on focus.

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function Pending() {
  const { F, sym, pendingList, confirmPending, dismissPending } = useApp();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [rows, setRows] = useState(null); // null = loading, [] = empty

  const load = useCallback(async () => {
    try { setRows(await pendingList()); } catch { setRows([]); }
  }, [pendingList]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onConfirm = useCallback(async (row) => {
    try {
      await confirmPending(row.id);
      setRows((prev) => (prev || []).filter((r) => r.id !== row.id));
      toast(`Added: ${row.merchant}`);
    } catch (e) { logError('pending:confirm', e); Alert.alert('Could not confirm', e?.message || String(e)); }
  }, [confirmPending, toast]);

  const onDismiss = useCallback(async (row) => {
    try {
      await dismissPending(row.id);
      setRows((prev) => (prev || []).filter((r) => r.id !== row.id));
      toast(`Dismissed: ${row.merchant}`);
    } catch (e) { logError('pending:dismiss', e); Alert.alert('Could not dismiss', e?.message || String(e)); }
  }, [dismissPending, toast]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

      <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 16, paddingHorizontal: 4 }}>
        Auto-created from your recurring patterns. Confirm the ones that hit,
        dismiss the rest — nothing counts until you confirm.
      </Text>

      {rows == null && (
        <Text style={{ textAlign: 'center', color: F.ink3, padding: 40 }}>Loading…</Text>
      )}

      {rows != null && rows.length === 0 && (
        <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
          borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>✓</Text>
          <Text style={{ fontSize: 15, color: F.ink2 }}>Nothing to confirm</Text>
          <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
            Turn on "Auto-create" for a recurring pattern on Home to have its
            charges pre-filled here each month.
          </Text>
        </View>
      )}

      {rows != null && rows.map((e) => (
        <View key={e.id} style={{ backgroundColor: F.surface, borderRadius: 18,
          borderWidth: 1, borderColor: F.line, marginBottom: 10, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: F.cream,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18 }}>{e.category_emoji || '🔁'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }} numberOfLines={1}>{e.merchant}</Text>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                {e.expense_date} · {e.category_name || 'Uncategorised'}
              </Text>
            </View>
            <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>{sym}{Number(e.amount).toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: F.line }}>
            <TouchableOpacity onPress={() => onDismiss(e)} activeOpacity={0.7}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: F.ink2, fontWeight: '600' }}>Dismiss</Text>
            </TouchableOpacity>
            <View style={{ width: 1, backgroundColor: F.line }} />
            <TouchableOpacity onPress={() => onConfirm(e)} activeOpacity={0.7}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: F.mint }}>
              <Text style={{ fontSize: 13, color: F.sageD, fontWeight: '700' }}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

export default React.memo(Pending);
