import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { ProgressBar } from '../components/UI';
import { palette, potBg } from '../theme';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Trends({ navigation }) {
  const { F, sym, pots, goals, totalSpend, repos } = useApp();
  const insets = useSafeAreaInsets();
  const pal = palette(F);

  const [trend, setTrend] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    repos.expenses.monthlyTrend(6).then(rows => {
      const enriched = rows.map(r => {
        const [y, m] = r.month_key.split('-');
        return {
          m: MONTH_NAMES[parseInt(m, 10) - 1],
          full: MONTH_NAMES[parseInt(m, 10) - 1] + ' ' + y,
          v: r.total,
        };
      });
      setTrend(enriched);
      if (enriched.length) setSelectedMonth(enriched.length - 1);
    });
  }, [repos]);

  const maxBar = trend.length ? Math.max(1, ...trend.map(d => d.v)) : 1;
  const prevMonth = trend.length >= 2 ? trend[trend.length - 2] : null;
  const thisMonth = trend.length ? trend[trend.length - 1] : null;
  const monthDelta = prevMonth && prevMonth.v > 0
    ? ((thisMonth.v - prevMonth.v) / prevMonth.v) * 100 : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
    >
      <Text style={{ fontSize: 26, color: F.ink, marginBottom: 20 }}>
        Where it <Text style={{ color: F.coral, fontStyle: 'italic' }}>flowed</Text>
      </Text>

      <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1,
        borderColor: F.line, marginBottom: 16, overflow: 'hidden' }}>
        <View style={{ padding: 18, paddingBottom: 12 }}>
          <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>
            Spending by category
          </Text>
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 2 }}>
            Total: <Text style={{ color: F.coral, fontWeight: '700' }}>{sym}{totalSpend.toFixed(0)}</Text>
            {'  '}this month
          </Text>
        </View>

        {pots.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center', borderTopWidth: 1, borderTopColor: F.line }}>
            <Text style={{ fontSize: 13, color: F.ink3 }}>No categories yet</Text>
          </View>
        ) : pots.map((p, i) => {
          const pct = p.budget > 0 ? p.spend / p.budget : 0;
          const over = pct > 1;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => navigation.navigate('PotDetail', { potId: p.id, potName: `${p.emoji} ${p.label}` })}
              activeOpacity={0.7}
              style={{ borderTopWidth: 1, borderTopColor: F.line, padding: 16 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pal[i % pal.length], flexShrink: 0 }}/>
                <Text style={{ fontSize: 16 }}>{p.emoji}</Text>
                <Text style={{ flex: 1, fontSize: 14, color: F.ink, fontWeight: '500' }}>{p.label}</Text>
                <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>{sym}{p.spend.toFixed(0)}</Text>
                {over && (
                  <View style={{ backgroundColor: '#fde2dc', borderRadius: 99,
                    paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, color: F.coral, fontWeight: '700' }}>over</Text>
                  </View>
                )}
                <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
              </View>
              {p.budget > 0 && (
                <>
                  <ProgressBar value={p.spend} max={p.budget} color={over ? F.coral : pal[i % pal.length]} F={F} height={6}/>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={{ fontSize: 11, color: F.ink3 }}>
                      {Math.round(pct * 100)}% of {sym}{p.budget} budget
                    </Text>
                    <Text style={{ fontSize: 11, color: over ? F.coral : F.sageD }}>
                      {over
                        ? `${sym}${(p.spend - p.budget).toFixed(0)} over`
                        : `${sym}${(p.budget - p.spend).toFixed(0)} left`}
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          onPress={() => navigation.navigate('AllExpenses')}
          activeOpacity={0.7}
          style={{ padding: 14, borderTopWidth: 1, borderTopColor: F.line, alignItems: 'center' }}
        >
          <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>View all transactions →</Text>
        </TouchableOpacity>
      </View>

      {/* Items link */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Items')}
        activeOpacity={0.85}
        style={{ backgroundColor: F.cream, borderRadius: 20, padding: 18, marginBottom: 16,
          flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <Text style={{ fontSize: 28 }}>📈</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: F.ink, fontWeight: '500' }}>Track items</Text>
          <Text style={{ fontSize: 12, color: F.ink2 }}>Per-unit price trends from scanned receipts</Text>
        </View>
        <Text style={{ fontSize: 18, color: F.ink3 }}>›</Text>
      </TouchableOpacity>

      {trend.length > 0 && (
        <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 18,
          borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontSize: 16, color: F.ink }}>{trend.length}-month trend</Text>
            {monthDelta !== null && (
              <View style={{ backgroundColor: monthDelta <= 0 ? F.mint : '#fde2dc',
                borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: monthDelta <= 0 ? F.sageD : F.coral, fontSize: 11, fontWeight: '600' }}>
                  {monthDelta <= 0 ? '↓' : '↑'} {Math.abs(monthDelta).toFixed(0)}% vs prev
                </Text>
              </View>
            )}
          </View>

          {selectedMonth !== null && trend[selectedMonth] && (
            <View style={{ backgroundColor: F.cream, borderRadius: 12, padding: 10,
              marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: F.ink2 }}>{trend[selectedMonth].full}</Text>
              <Text style={{ fontSize: 20, color: F.coral, fontWeight: '600' }}>
                {sym}{Math.round(trend[selectedMonth].v).toLocaleString()}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {trend.map((d, i) => {
              const barH = (d.v / maxBar) * 84;
              const isSelected = selectedMonth === i;
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => setSelectedMonth(i)}
                  activeOpacity={0.75}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 100 }}
                >
                  {isSelected && (
                    <Text style={{ fontSize: 9, color: F.coral, fontWeight: '700', marginBottom: 3 }}>
                      {sym}{(d.v / 1000).toFixed(1)}k
                    </Text>
                  )}
                  <View style={{
                    width: '100%', height: barH, borderRadius: 6,
                    backgroundColor: isSelected ? F.coral : F.blushD,
                    opacity: isSelected ? 1 : 0.4,
                  }}/>
                  <Text style={{ fontSize: 10, color: isSelected ? F.coral : F.ink3,
                    marginTop: 5, fontWeight: isSelected ? '700' : '400' }}>
                    {d.m}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {goals.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between',
            alignItems: 'baseline', marginBottom: 12 }}>
            <Text style={{ fontSize: 19, color: F.ink }}>Goals in flight</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Goals')} activeOpacity={0.7}>
              <Text style={{ fontSize: 13, color: F.coral, fontWeight: '600' }}>manage all</Text>
            </TouchableOpacity>
          </View>

          {goals.slice(0, 3).map((g, i) => {
            const pct = g.target_amount > 0 ? g.saved_amount / g.target_amount : 0;
            const colors = [F.coral, F.sageD, F.sky2];
            const bgs    = [F.cream, F.mint, F.sky];

            return (
              <TouchableOpacity
                key={g.id}
                onPress={() => navigation.navigate('Goals')}
                activeOpacity={0.75}
                style={{ backgroundColor: bgs[i % 3], borderRadius: 20, padding: 18,
                  marginBottom: 10 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 28 }}>{g.emoji}</Text>
                    <View>
                      <Text style={{ fontSize: 16, color: F.ink, fontWeight: '500' }}>{g.name}</Text>
                      {g.eta && <Text style={{ fontSize: 12, color: F.ink3 }}>ETA: {g.eta}</Text>}
                    </View>
                  </View>
                  <Text style={{ fontSize: 24, color: colors[i % 3], fontWeight: '600' }}>
                    {Math.round(pct * 100)}%
                  </Text>
                </View>

                <ProgressBar value={g.saved_amount} max={g.target_amount} color={colors[i % 3]} F={F} height={8}/>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}
