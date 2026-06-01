// PS-34 — Tag analytics surface.
//
// Lists tags ranked by spend with a proportion bar + an inner category
// breakdown, scoped to this month or all-time. Tapping a tag drills into
// AllExpenses filtered by that tag (buildWhere already supports `tagIds`).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@core/theme/ThemeContext';
import { useSettings } from '@features/profile/settings.context';
import { tagAggregates } from '../../../analytics';

const fmt = (n, sym) => `${sym}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

function TagAnalytics({ navigation }) {
  const { F } = useTheme();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();
  const monthKey = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const [scope, setScope] = useState('month'); // 'month' | 'all'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await tagAggregates(scope === 'month' ? monthKey : null));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [scope, monthKey]);

  // Refetch on focus so tags edited elsewhere reflect here.
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  const max = rows[0]?.total || 1;
  const grandTotal = rows.reduce((s, r) => s + (r.total || 0), 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <View style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: F.surface,
        borderRadius: 99, borderWidth: 1, borderColor: F.line, padding: 3, marginBottom: 16 }}>
        {[{ k: 'month', l: 'This month' }, { k: 'all', l: 'All time' }].map((opt) => {
          const sel = scope === opt.k;
          return (
            <TouchableOpacity key={opt.k} onPress={() => setScope(opt.k)}
              accessibilityRole="button" accessibilityState={{ selected: sel }}
              style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99,
                backgroundColor: sel ? F.coral : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: sel ? '#fff' : F.ink2 }}>{opt.l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={F.coral} style={{ marginTop: 40 }} />
      ) : rows.length === 0 ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 40,
          alignItems: 'center', borderWidth: 1, borderColor: F.line, marginTop: 16 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🏷</Text>
          <Text style={{ fontSize: 15, color: F.ink2 }}>No tagged spends {scope === 'month' ? 'this month' : 'yet'}</Text>
          <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
            Add tags to expenses (e.g. work, reimbursable) to see the splits here.
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: F.ink3, marginBottom: 14 }}>
            {rows.length} tag{rows.length === 1 ? '' : 's'} · {fmt(grandTotal, sym)} tagged
            {' '}(tags can overlap, so this may exceed total spend)
          </Text>
          {rows.map((t) => {
            const pct = grandTotal > 0 ? Math.round((t.total / grandTotal) * 100) : 0;
            return (
              <TouchableOpacity key={t.tag_id} activeOpacity={0.8}
                onPress={() => navigation.navigate('AllExpenses', { criteria: { tagIds: [t.tag_id] } })}
                style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1,
                  borderColor: F.line, padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 8,
                    backgroundColor: t.tag_color || F.coral }} />
                  <Text style={{ flex: 1, fontSize: 14, color: F.ink, fontWeight: '600' }}>{t.tag_name}</Text>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>{fmt(t.total, sym)}</Text>
                  <Text style={{ fontSize: 11, color: F.ink3, width: 38, textAlign: 'right' }}>{pct}%</Text>
                </View>
                <View style={{ height: 6, backgroundColor: F.line, borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: t.tag_color || F.coral,
                    width: `${Math.max(3, (t.total / max) * 100)}%` }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    {t.txn_count} txn{t.txn_count === 1 ? '' : 's'}
                  </Text>
                  {t.cat_breakdown?.length > 0 && (
                    <Text style={{ fontSize: 11, color: F.ink3 }} numberOfLines={1}>
                      {t.cat_breakdown.slice(0, 3).map((c) =>
                        `${c.category_emoji || ''} ${fmt(c.total, sym)}`.trim()).join(' · ')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

export default React.memo(TagAnalytics);
