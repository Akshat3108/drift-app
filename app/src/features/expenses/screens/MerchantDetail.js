// 5.9 — MerchantDetail. Mirrors the structure of ItemTrend so a user moving
// between items and merchants reads the screen the same way:
//   header card (name + this-month + 12-month bar chart)
//   category breakdown strip
//   recents list (tap → Detail)

import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { expenses as expRepo } from '@features/expenses/repo';

function MerchantDetail({ route, navigation }) {
  const { F, sym } = useApp();
  const insets = useSafeAreaInsets();
  const { merchantId, displayName } = route.params;

  const [summary, setSummary]       = useState(null);
  const [trend, setTrend]           = useState([]);
  const [breakdown, setBreakdown]   = useState([]);
  const [recents, setRecents]       = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  // 6.20 — distinct purchase dates within the last 12 months. Used to
  // compute avg cadence (days between visits).
  const [purchaseDates, setPurchaseDates] = useState([]);

  useEffect(() => {
    if (merchantId == null) return;
    (async () => {
      const [s, t, b, r, d] = await Promise.all([
        expRepo.merchantSummary({ merchantId, months: 6 }),
        expRepo.merchantMonthlyTrend({ merchantId, months: 12 }),
        expRepo.merchantCategoryBreakdown({ merchantId, months: 12 }),
        expRepo.merchantRecents({ merchantId, limit: 30 }),
        expRepo.merchantPurchaseDates({ merchantId, months: 12 }),
      ]);
      setSummary(s);
      setTrend(t);
      setBreakdown(b);
      setRecents(r);
      setPurchaseDates(d.map((row) => row.expense_date).filter(Boolean));
    })();
  }, [merchantId]);

  // 6.20 — cadence = avg days between consecutive distinct visit dates.
  // Null when < 2 visits (can't compute an interval from one date).
  const cadenceDays = useMemo(() => {
    if (purchaseDates.length < 2) return null;
    const intervals = [];
    for (let i = 1; i < purchaseDates.length; i++) {
      const prev = Date.parse(purchaseDates[i - 1] + 'T00:00:00Z');
      const cur  = Date.parse(purchaseDates[i] + 'T00:00:00Z');
      if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
      const days = Math.round((cur - prev) / 86400000);
      if (days > 0) intervals.push(days);
    }
    if (intervals.length === 0) return null;
    return Math.round(intervals.reduce((s, n) => s + n, 0) / intervals.length);
  }, [purchaseDates]);

  const trendData = useMemo(() => trend.map((t) => t.total || 0), [trend]);
  const maxBar = trendData.length ? Math.max(...trendData) : 0;
  const breakdownTotal = useMemo(
    () => breakdown.reduce((s, b) => s + (b.total || 0), 0),
    [breakdown]
  );

  if (merchantId == null) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: F.ink2 }}>Merchant not found</Text>
      </View>
    );
  }

  const display = displayName || summary?.name || 'Merchant';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 28, color: F.ink, fontWeight: '400' }}>
          {display}
        </Text>
        {summary ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <Text style={{ fontSize: 36, color: F.coral, fontWeight: '600' }}>
                {sym}{Number(summary.total_window || 0).toFixed(0)}
              </Text>
              <Text style={{ fontSize: 13, color: F.ink2 }}>last 6 months</Text>
            </View>
            {/* 6.20 — all-time total surfaced under the window total. The summary
                row already aggregates both; previous render only showed window. */}
            {Number(summary.total_all) > Number(summary.total_window) && (
              <Text style={{ fontSize: 12, color: F.ink3, marginTop: 2 }}>
                {sym}{Number(summary.total_all).toFixed(0)} all-time across {summary.txn_count_all} visits
              </Text>
            )}
            <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6 }}>
              avg {sym}{Number(summary.avg_amount || 0).toFixed(0)} per visit
              {summary.last_seen ? ` · last ${summary.last_seen}` : ''}
            </Text>
            {/* 6.20 — visit cadence. Only when we have ≥ 2 distinct visits in the
                last 12 months — fewer can't yield an interval. */}
            {cadenceDays != null && (
              <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
                Cadence: <Text style={{ color: F.coral, fontWeight: '700' }}>
                  every ~{cadenceDays}d
                </Text> on average
              </Text>
            )}
          </>
        ) : (
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 6 }}>Loading…</Text>
        )}
      </View>

      <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 18,
        borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 12 }}>Spend over time</Text>
        {selectedIdx !== null && trend[selectedIdx] && (
          <View style={{ backgroundColor: F.cream, borderRadius: 12, padding: 10,
            marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 12, color: F.ink2 }}>{trend[selectedIdx].month_key}</Text>
              <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                {trend[selectedIdx].txn_count} visit{trend[selectedIdx].txn_count === 1 ? '' : 's'}
              </Text>
            </View>
            <Text style={{ fontSize: 20, color: F.coral, fontWeight: '600' }}>
              {sym}{Number(trend[selectedIdx].total).toFixed(0)}
            </Text>
          </View>
        )}
        {trend.length === 0 ? (
          <Text style={{ textAlign: 'center', color: F.ink3, padding: 20 }}>No history yet</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
            {trend.slice(-12).map((t, i) => {
              const norm = maxBar > 0 ? (t.total / maxBar) : 0;
              const barH = 12 + norm * 100;
              const realIdx = (trend.length - Math.min(12, trend.length)) + i;
              const isSel = selectedIdx === realIdx;
              return (
                <TouchableOpacity key={t.month_key}
                  onPress={() => setSelectedIdx(realIdx)}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 120 }}>
                  <View style={{
                    width: '100%', height: barH, borderRadius: 6,
                    backgroundColor: isSel ? F.coral : F.blushD,
                    opacity: isSel ? 1 : 0.55,
                  }}/>
                  <Text style={{ fontSize: 9, color: F.ink3, marginTop: 4 }}>
                    {t.month_key.slice(5)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {breakdown.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 15, color: F.ink, marginBottom: 8, fontWeight: '500' }}>
            By category
          </Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, overflow: 'hidden' }}>
            {breakdown.map((b, i) => {
              const share = breakdownTotal > 0 ? (b.total / breakdownTotal) : 0;
              // 6.20 — only category rows with a real id can deep-link; the
              // uncategorised bucket (id null) renders as a plain view.
              const Wrapper = b.id != null ? TouchableOpacity : View;
              const wrapperProps = b.id != null ? {
                activeOpacity: 0.7,
                onPress: () => navigation.navigate('AllExpenses', {
                  criteria: { merchantIds: [merchantId], categoryIds: [b.id] },
                }),
              } : {};
              return (
                <Wrapper key={b.id ?? `unc-${i}`} {...wrapperProps}
                  style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 18 }}>{b.emoji || '💰'}</Text>
                    <Text style={{ flex: 1, fontSize: 14, color: F.ink, fontWeight: '500' }}>
                      {b.name || 'Uncategorised'}
                    </Text>
                    <Text style={{ fontSize: 14, color: F.ink }}>
                      {sym}{Number(b.total).toFixed(0)}
                    </Text>
                    {b.id != null && <Text style={{ fontSize: 14, color: F.ink3 }}>›</Text>}
                  </View>
                  <View style={{ marginTop: 8, height: 6, backgroundColor: F.cream,
                    borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{
                      width: `${Math.round(share * 100)}%`,
                      height: '100%', backgroundColor: F.coral,
                    }}/>
                  </View>
                  <Text style={{ fontSize: 10, color: F.ink3, marginTop: 4 }}>
                    {b.txn_count} spend{b.txn_count === 1 ? '' : 's'} · {Math.round(share * 100)}%
                  </Text>
                </Wrapper>
              );
            })}
          </View>
        </View>
      )}

      {recents.length > 0 && (
        <View>
          <Text style={{ fontSize: 15, color: F.ink, marginBottom: 8, fontWeight: '500' }}>
            Recent spends
          </Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, overflow: 'hidden' }}>
            {recents.map((e, i) => (
              <TouchableOpacity
                key={e.id}
                onPress={() => navigation.navigate('Detail', { id: e.id })}
                activeOpacity={0.7}
                style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                  flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>{e.category_emoji || '💰'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: F.ink, fontWeight: '500' }}>
                    {e.merchant}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    {e.expense_date} · {e.category_name || 'Uncategorised'}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: F.ink }}>
                  {sym}{Number(e.amount).toFixed(2)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

export default React.memo(MerchantDetail);
