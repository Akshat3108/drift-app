import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@core/theme/ThemeContext';
import { useSettings } from '@features/profile/settings.context';
import { useExpenses } from '@features/expenses/context';
import { recurringCandidates } from '../../../analytics';

// 7.11 — "Expected this month" Home tile.
//
// Surfaces merchants whose history qualifies as recurring (see
// analytics/patterns.js for the definition). Each row shows the projected
// date + expected amount + a checkmark when this month already logged a
// matching expense; otherwise a "log" affordance opens Add with the
// merchant/amount/category prefilled.
//
// Rendered only when ≥1 candidate exists. Failing the analytics call (e.g.
// fresh install) silently returns nothing.

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

export default function ExpectedThisMonth({ navigation }) {
  const { F } = useTheme();
  const { sym } = useSettings();
  const { expenses } = useExpenses();
  const [data, setData] = useState(null);
  const gen = expenses.length; // cheap signal — re-derive when expenses change

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const out = await recurringCandidates({});
        if (!cancelled) setData(out);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => { cancelled = true; };
  }, [gen]);

  if (!data || !data.candidates || data.candidates.length === 0) return null;

  const candidates = data.candidates.slice(0, 4);
  const loggedCount = data.candidates.filter(c => c.logged_this_month_id != null).length;
  const totalExpected = data.total_expected || 0;
  const remaining = data.candidates
    .filter(c => c.logged_this_month_id == null)
    .reduce((s, c) => s + c.expected_amount, 0);

  return (
    <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 16,
      borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600', flex: 1 }}>
          🔁 Expected this month
        </Text>
        <Text style={{ fontSize: 11, color: F.ink3 }}>
          {loggedCount}/{data.candidates.length} logged
        </Text>
      </View>
      <Text style={{ fontSize: 13, color: F.ink3, marginBottom: 10 }}>
        {fmt(sym, totalExpected)} projected · {fmt(sym, remaining)} still expected
      </Text>

      {candidates.map((c) => {
        const logged = c.logged_this_month_id != null;
        return (
          <TouchableOpacity
            key={c.merchant}
            onPress={() => {
              if (logged) {
                navigation?.navigate('Detail', { id: c.logged_this_month_id });
              } else {
                navigation?.navigate('Add', {
                  prefillMerchant: c.merchant,
                  prefillAmount: c.expected_amount,
                  prefillCategoryId: c.expected_category_id,
                  prefillDate: c.projected_date_this_month,
                });
              }
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${logged ? 'View' : 'Log'} ${c.merchant} recurring expense`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingVertical: 8, borderTopWidth: 1, borderTopColor: F.line }}>
            <View style={{ width: 28, alignItems: 'center' }}>
              <Text style={{ fontSize: 16 }}>{c.category_emoji || '🔁'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: F.ink, fontWeight: '500' }}>
                {c.merchant}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3 }}>
                ~day {c.expected_day} · {c.confidence}
                {c.category_name && ` · ${c.category_name}`}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 14, color: logged ? F.ink2 : F.ink, fontWeight: '600' }}>
                {fmt(sym, c.expected_amount)}
              </Text>
              <Text style={{ fontSize: 11, color: logged ? F.sageD : F.coral }}>
                {logged ? '✓ logged' : '⋯ pending'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
