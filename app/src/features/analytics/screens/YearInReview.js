// PS-24 — Year-in-Review retrospective screen.
//
// Single scrolling page composed from `yearRollup({year})`. Year stepper at
// top (prev/next). Bottom "Save as PDF" button shells `yearInReviewHTML`
// through expo-print + expo-sharing (same lazy-require pattern as 5.7).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { yearRollup } from '../../../analytics';
import { yearInReviewHTML, humanFilename, MIME_TYPES } from '@features/expenses/export';
import { logError } from '@core/utils/log';
import { formatShort } from '@core/utils/format';

const EARLIEST_YEAR = 2018; // sane floor — predates the app and most users.

export default function YearInReview({ navigation }) {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rollup, setRollup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await yearRollup({ year });
      setRollup(data);
    } catch (e) {
      logError('yearInReview.load', e);
      setRollup(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const exportPdf = useCallback(async () => {
    if (!rollup || pdfBusy) return;
    setPdfBusy(true);
    try {
      let Print, Sharing;
      try {
        Print = require('expo-print');
        Sharing = require('expo-sharing');
      } catch (_) {
        Alert.alert('PDF unavailable',
          'Install `expo-print` and `expo-sharing` in app/ and rebuild Android to enable PDF export.');
        return;
      }
      const html = yearInReviewHTML(rollup, sym || '₹');
      const { uri } = await Print.printToFileAsync({ html });
      const filename = humanFilename({
        format: 'pdf',
        rangeLabel: `year-${rollup.year}`,
        generatedAt: new Date().toISOString(),
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: MIME_TYPES.pdf, dialogTitle: `Drift — ${filename}` });
      } else {
        Alert.alert('PDF saved', `Saved to ${uri}`);
      }
    } catch (e) {
      logError('yearInReview.pdf', e);
      Alert.alert('Export failed', e?.message || String(e));
    } finally {
      setPdfBusy(false);
    }
  }, [rollup, sym, pdfBusy]);

  const isEmpty = useMemo(
    () => !loading && (!rollup || rollup.total_spend === 0 && rollup.total_income === 0),
    [loading, rollup],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 80, paddingHorizontal: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral} colors={[F.coral]}/>}
    >
      {/* Year stepper */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <TouchableOpacity
          onPress={() => year > EARLIEST_YEAR && setYear(year - 1)}
          activeOpacity={0.7}
          disabled={year <= EARLIEST_YEAR}
          style={{ padding: 8 }}>
          <Text style={{ fontSize: 20, color: year <= EARLIEST_YEAR ? F.ink3 : F.ink }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>
          {year} <Text style={{ color: F.coral, fontStyle: 'italic' }}>in review</Text>
        </Text>
        <TouchableOpacity
          onPress={() => year < thisYear && setYear(year + 1)}
          activeOpacity={0.7}
          disabled={year >= thisYear}
          style={{ padding: 8 }}>
          <Text style={{ fontSize: 20, color: year >= thisYear ? F.ink3 : F.ink }}>›</Text>
        </TouchableOpacity>
      </View>

      {loading && !rollup ? (
        <View style={{ padding: 32, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: F.ink2 }}>Loading…</Text>
        </View>
      ) : isEmpty ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 32, marginBottom: 6 }}>📜</Text>
          <Text style={{ fontSize: 14, color: F.ink2, textAlign: 'center' }}>
            No expenses or income recorded in {year} yet.
          </Text>
        </View>
      ) : (
        <>
          {/* Hero — three numbers */}
          <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {rollup.three_numbers.map((n, idx) => (
                <View key={idx} style={{ flex: 1, backgroundColor: F.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: F.line }}>
                  <Text style={{ fontSize: 10, color: F.ink3, letterSpacing: 0.7, fontWeight: '700' }}>
                    {n.label.toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 20, color: F.ink, marginTop: 6 }}>
                    {n.label.includes('%') ? `${n.value}%` : `${sym}${formatShort(n.value)}`}
                  </Text>
                </View>
              ))}
            </View>
            {rollup.yoy && (
              <Text style={{ fontSize: 12, color: F.ink2, marginTop: 12 }}>
                vs {rollup.yoy.prior_year}:{' '}
                <Text style={{ color: rollup.yoy.direction === 'up' ? F.coral : (F.sageD || F.ink), fontWeight: '700' }}>
                  {rollup.yoy.direction === 'up' ? '+' : ''}{rollup.yoy.delta_pct}%
                </Text>{' '}
                ({sym}{formatShort(rollup.yoy.prior_total)} last year)
              </Text>
            )}
          </View>

          {rollup.biggest_splurge && (
            <SectionCard F={F} title="Biggest single spend">
              <Text style={{ fontSize: 22, color: F.coral, fontWeight: '500' }}>
                {sym}{Math.round(rollup.biggest_splurge.amount).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 13, color: F.ink, marginTop: 4 }}>
                {rollup.biggest_splurge.category_emoji ? rollup.biggest_splurge.category_emoji + ' ' : ''}
                {rollup.biggest_splurge.merchant}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                {rollup.biggest_splurge.expense_date}{rollup.biggest_splurge.category_name ? ` · ${rollup.biggest_splurge.category_name}` : ''}
              </Text>
            </SectionCard>
          )}

          {rollup.longest_streak?.best > 0 && (
            <SectionCard F={F} title="Longest in-budget streak">
              <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>
                🔥 {rollup.longest_streak.best} days
              </Text>
            </SectionCard>
          )}

          {rollup.top_categories.length > 0 && (
            <SectionCard F={F} title="Top 5 categories">
              {rollup.top_categories.map((c) => (
                <RankRow key={c.id} F={F} sym={sym}
                  left={`${c.emoji || ''} ${c.name}`}
                  amount={c.total}
                  right={`${c.share_pct}%`}/>
              ))}
            </SectionCard>
          )}

          {rollup.top_merchants.length > 0 && (
            <SectionCard F={F} title="Top 5 merchants">
              {rollup.top_merchants.map((m) => (
                <RankRow key={m.id} F={F} sym={sym}
                  left={m.name}
                  amount={m.total}
                  right={`${m.txn_count}×`}/>
              ))}
            </SectionCard>
          )}

          {rollup.top_items && rollup.top_items.length > 0 && (
            <SectionCard F={F} title="Top 5 items">
              {rollup.top_items.map((it) => (
                <RankRow key={it.normalized_name} F={F} sym={sym}
                  left={it.display_name || it.normalized_name}
                  amount={it.spend_sum}
                  right={`${it.qty_sum.toFixed(1)}×`}/>
              ))}
            </SectionCard>
          )}

          <TouchableOpacity
            onPress={exportPdf}
            disabled={pdfBusy}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Save year in review as PDF"
            style={{ backgroundColor: F.coral, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
              {pdfBusy ? 'Generating…' : 'Save as PDF'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function SectionCard({ F, title, children }) {
  return (
    <View style={{ backgroundColor: F.cream, borderRadius: 18, padding: 16, marginBottom: 12 }}>
      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>
        {(title || '').toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function RankRow({ F, sym, left, amount, right }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
      borderTopWidth: 1, borderTopColor: F.line }}>
      <Text style={{ flex: 1, fontSize: 13, color: F.ink }} numberOfLines={1}>{left}</Text>
      <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600', marginLeft: 8 }}>
        {sym}{Math.round(amount || 0).toLocaleString()}
      </Text>
      <Text style={{ fontSize: 11, color: F.ink3, marginLeft: 8, minWidth: 50, textAlign: 'right' }}>
        {right}
      </Text>
    </View>
  );
}
