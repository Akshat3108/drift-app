import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { ProgressBar } from '../components/UI';
import { palette, potBg } from '../theme';

const MONTH_TREND = [
  { m: 'Nov', v: 1820, full: 'November' },
  { m: 'Dec', v: 2340, full: 'December' },
  { m: 'Jan', v: 1690, full: 'January'  },
  { m: 'Feb', v: 1980, full: 'February' },
  { m: 'Mar', v: 2210, full: 'March'    },
  { m: 'Apr', v: 2104, full: 'April'    },
];

export default function Trends({ navigation }) {
  const { F, sym, pots, goals, expenses } = useApp();
  const insets = useSafeAreaInsets();
  const pal = palette(F);
  const total = pots.reduce((s, p) => s + p.spend, 0);

  const [range, setRange]         = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(5); // April (last bar) selected by default
  const [expandedPot, setExpandedPot]     = useState(null);

  const maxBar = Math.max(...MONTH_TREND.map(d => d.v));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
    >
      <Text style={{ fontSize: 26, color: F.ink, marginBottom: 20 }}>
        Where it <Text style={{ color: F.coral, fontStyle: 'italic' }}>flowed</Text>
      </Text>

      {/* ── Range tabs ── */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        {[['week','Week'],['month','Month'],['year','Year']].map(([k,l]) => (
          <TouchableOpacity key={k} onPress={() => setRange(k)} activeOpacity={0.75} style={{
            paddingHorizontal: 18, paddingVertical: 9, borderRadius: 99,
            backgroundColor: range === k ? F.coral : F.surface,
            borderWidth: 1, borderColor: range === k ? F.coral : F.line,
          }}>
            <Text style={{ color: range === k ? '#fff' : F.ink2, fontSize: 13, fontWeight: '600' }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Spending by category ── */}
      <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1,
        borderColor: F.line, marginBottom: 16, overflow: 'hidden' }}>
        {/* Header */}
        <View style={{ padding: 18, paddingBottom: 12 }}>
          <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>
            Spending by category
          </Text>
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 2 }}>
            Total: <Text style={{ color: F.coral, fontWeight: '700' }}>{sym}{total.toFixed(0)}</Text>
            {'  '}this month
          </Text>
        </View>

        {/* Category rows — each taps to PotDetail */}
        {pots.map((p, i) => {
          const pct = p.spend / p.budget;
          const over = pct > 1;
          const isExpanded = expandedPot === p.key;

          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => navigation.navigate('PotDetail', { potKey: p.key, potName: `${p.emoji} ${p.label}` })}
              activeOpacity={0.7}
              style={{
                borderTopWidth: 1, borderTopColor: F.line,
                padding: 16,
                backgroundColor: isExpanded ? potBg(F, p.color) : F.surface,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {/* Colour dot */}
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pal[i], flexShrink: 0 }}/>
                {/* Emoji + name */}
                <Text style={{ fontSize: 16 }}>{p.emoji}</Text>
                <Text style={{ flex: 1, fontSize: 14, color: F.ink, fontWeight: '500' }}>{p.label}</Text>
                {/* Amount */}
                <Text style={{ fontSize: 16, color: F.ink, fontWeight: '600' }}>{sym}{p.spend.toFixed(0)}</Text>
                {/* Over-budget badge */}
                {over && (
                  <View style={{ backgroundColor: '#fde2dc', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, color: F.coral, fontWeight: '700' }}>over</Text>
                  </View>
                )}
                <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
              </View>

              {/* Progress bar */}
              <ProgressBar value={p.spend} max={p.budget} color={over ? F.coral : pal[i]} F={F} height={6}/>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 11, color: F.ink3 }}>
                  {Math.round(pct * 100)}% of {sym}{p.budget} budget
                </Text>
                <Text style={{ fontSize: 11, color: over ? F.coral : F.sageD }}>
                  {over
                    ? `${sym}${(p.spend - p.budget).toFixed(0)} over`
                    : `${sym}${(p.budget - p.spend).toFixed(0)} left`
                  }
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* View all footer */}
        <TouchableOpacity
          onPress={() => navigation.navigate('PotDetail', { potKey: pots[0]?.key, potName: pots[0]?.label })}
          activeOpacity={0.7}
          style={{ padding: 14, borderTopWidth: 1, borderTopColor: F.line, alignItems: 'center' }}
        >
          <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>View all transactions →</Text>
        </TouchableOpacity>
      </View>

      {/* ── 6-month trend — each bar tappable ── */}
      <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 18,
        borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 16, color: F.ink }}>6-month trend</Text>
          <View style={{ backgroundColor: F.mint, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: F.sageD, fontSize: 11, fontWeight: '600' }}>↓ 5% vs Apr</Text>
          </View>
        </View>

        {/* Selected month callout */}
        {selectedMonth !== null && (
          <View style={{ backgroundColor: F.cream, borderRadius: 12, padding: 10,
            marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: F.ink2 }}>
              {MONTH_TREND[selectedMonth].full}
            </Text>
            <Text style={{ fontSize: 20, color: F.coral, fontWeight: '600' }}>
              {sym}{MONTH_TREND[selectedMonth].v.toLocaleString()}
            </Text>
          </View>
        )}

        {/* Bars — tap each to select */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 100 }}>
          {MONTH_TREND.map((d, i) => {
            const barH = (d.v / maxBar) * 84;
            const isSelected = selectedMonth === i;
            return (
              <TouchableOpacity
                key={d.m}
                onPress={() => setSelectedMonth(i)}
                activeOpacity={0.75}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 100 }}
              >
                {/* Value label above bar when selected */}
                {isSelected && (
                  <Text style={{ fontSize: 9, color: F.coral, fontWeight: '700', marginBottom: 3 }}>
                    {sym}{(d.v/1000).toFixed(1)}k
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

      {/* ── Carbon ── */}
      <TouchableOpacity
        onPress={() => Alert.alert(
          '🌱 Carbon footprint',
          `This month: 24 kg CO₂e\n\nTop emitters:\n  🚗 Transport: 8.2 kg\n  📦 Shopping: 4.1 kg\n  🥬 Groceries: 5.0 kg\n\nYou\'re in the top 18% of users this month. Keep it up!`,
          [{ text: 'Got it' }]
        )}
        activeOpacity={0.75}
        style={{ backgroundColor: F.mint, borderRadius: 20, padding: 18, marginBottom: 16,
          flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <Text style={{ fontSize: 32 }}>🌱</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, color: F.ink, fontWeight: '400' }}>24 kg CO₂e</Text>
          <Text style={{ fontSize: 12, color: F.ink2 }}>−12% vs Apr · top 18% of users</Text>
        </View>
        <Text style={{ fontSize: 18, color: F.sageD }}>›</Text>
      </TouchableOpacity>

      {/* ── Goals in flight ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontSize: 19, color: F.ink }}>Goals in flight</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Goals')} activeOpacity={0.7}>
          <Text style={{ fontSize: 13, color: F.coral, fontWeight: '600' }}>manage all</Text>
        </TouchableOpacity>
      </View>

      {goals.map((g, i) => {
        const pct = g.have / g.need;
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
                  <Text style={{ fontSize: 12, color: F.ink3 }}>ETA: {g.eta}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={{ fontSize: 24, color: colors[i % 3], fontWeight: '600' }}>
                  {Math.round(pct * 100)}%
                </Text>
                <Text style={{ fontSize: 11, color: F.ink3 }}>
                  {sym}{g.need - g.have} to go
                </Text>
              </View>
            </View>

            <ProgressBar value={g.have} max={g.need} color={colors[i % 3]} F={F} height={8}/>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: F.ink2 }}>
                <Text style={{ color: F.ink, fontWeight: '600' }}>{sym}{g.have.toLocaleString()}</Text> saved
              </Text>
              <Text style={{ fontSize: 12, color: colors[i % 3], fontWeight: '600' }}>View →</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* ── Forecast nudge ── */}
      <TouchableOpacity
        activeOpacity={0.75}
        style={{ backgroundColor: F.cream, borderRadius: 20, padding: 18, marginTop: 6 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <Text style={{ fontSize: 30 }}>🔮</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: F.ink, fontStyle: 'italic' }}>Forecast</Text>
            <Text style={{ fontSize: 13, color: F.ink2, marginTop: 4, lineHeight: 20 }}>
              May ends near{' '}
              <Text style={{ color: F.coral, fontWeight: '700' }}>{sym}2,540</Text>
              {' '}— about {sym}260 under budget. You're on track ✿
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}
