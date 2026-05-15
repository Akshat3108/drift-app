import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { ProgressBar } from '../components/UI';
import { palette, potBg } from '../theme';

export default function Home({ navigation }) {
  const { F, sym, pots, expenses, totalSpend, monthBudget } = useApp();
  const insets = useSafeAreaInsets();
  const pal = palette(F);
  const left = Math.max(0, monthBudget - totalSpend);
  const leftCents = ((left % 1) * 100).toFixed(0).padStart(2, '0');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        // Extra bottom padding so last card isn't behind tab bar
        paddingBottom: insets.bottom + 100,
        paddingHorizontal: 20,
      }}
    >
      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20 }}>
        <View>
          <Text style={{ fontSize: 13, color: F.ink2 }}>Good morning,</Text>
          <Text style={{ fontSize: 28, color: F.ink, fontWeight: '400' }}>
            Hi <Text style={{ fontStyle: 'italic' }}>Riya</Text>{' '}
            <Text style={{ color: F.coral }}>✿</Text>
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: F.cream,
            alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: F.line }}
        >
          <Text style={{ fontSize: 18, color: F.coral }}>R</Text>
        </TouchableOpacity>
      </View>

      {/* ── Balance hero ── */}
      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 20 }}>
        <Text style={{ fontSize: 11, color: F.ink2 }}>You have</Text>
        <Text style={{ fontSize: 52, color: F.ink, fontWeight: '400', lineHeight: 58, marginTop: 4 }}>
          {sym}{Math.floor(left).toLocaleString()}
          <Text style={{ fontSize: 28, color: F.ink3 }}>.{leftCents}</Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>left to spend this month</Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('NetWorth')}
            activeOpacity={0.75}
            style={{ flex: 1, backgroundColor: F.surface, borderRadius: 14, padding: 14,
              borderWidth: 1, borderColor: F.line }}
          >
            <Text style={{ fontSize: 10, color: F.ink3 }}>Net worth</Text>
            <Text style={{ fontSize: 20, color: F.ink, marginTop: 3 }}>{sym}38.4k</Text>
            <Text style={{ fontSize: 11, color: F.sageD, marginTop: 2 }}>↑ 2.1% this mo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('Travel')}
            activeOpacity={0.75}
            style={{ flex: 1, backgroundColor: F.surface, borderRadius: 14, padding: 14,
              borderWidth: 1, borderColor: F.line }}
          >
            <Text style={{ fontSize: 10, color: F.ink3 }}>Travel mode</Text>
            <Text style={{ fontSize: 20, color: F.ink, marginTop: 3 }}>✈ Japan</Text>
            <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>in 84 days</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Pots ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontSize: 19, color: F.ink }}>Your pots</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Trends')} activeOpacity={0.7}>
          <Text style={{ fontSize: 13, color: F.coral, fontWeight: '600' }}>see all</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {pots.map((p, i) => {
          const pct = p.spend / p.budget;
          const over = pct > 1;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => navigation.navigate('PotDetail', { potKey: p.key, potName: `${p.emoji} ${p.label}` })}
              activeOpacity={0.75}
              style={{
                width: '47%',
                backgroundColor: potBg(F, p.color),
                borderRadius: 18, padding: 14,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 16 }}>{p.emoji}</Text>
                <Text style={{ fontSize: 12, color: F.ink2, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                  {p.label}
                </Text>
              </View>
              <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
                {sym}{p.spend.toFixed(0)}
              </Text>
              <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>
                of {sym}{p.budget}
              </Text>
              <ProgressBar
                value={p.spend} max={p.budget}
                color={over ? F.coral : F.sageD} F={F} height={4}
                style={{ marginTop: 10 }}
              />
              <Text style={{ fontSize: 10, color: over ? F.coral : F.ink3, marginTop: 4, textAlign: 'right' }}>
                {Math.round(pct * 100)}% used →
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Streak ── */}
      <TouchableOpacity
        activeOpacity={0.75}
        style={{ backgroundColor: F.cream, borderRadius: 18, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 }}
      >
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: F.surface,
          alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24 }}>🔥</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: F.ink }}>
            <Text style={{ fontStyle: 'italic' }}>7-day</Text> streak — under budget
          </Text>
          <Text style={{ fontSize: 12, color: F.ink2, marginTop: 2 }}>
            23 more for "Mindful month" badge
          </Text>
        </View>
        <Text style={{ fontSize: 18, color: F.ink3 }}>›</Text>
      </TouchableOpacity>

      {/* ── Recent transactions ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontSize: 19, color: F.ink }}>Today</Text>
        <Text style={{ fontSize: 12, color: F.ink3 }}>{expenses.length} this month</Text>
      </View>

      <View style={{ backgroundColor: F.surface, borderRadius: 20,
        borderWidth: 1, borderColor: F.line, overflow: 'hidden', marginBottom: 24 }}>
        {expenses.slice(0, 5).map((r, i) => (
          <TouchableOpacity
            key={r.id}
            onPress={() => navigation.navigate('Detail', { id: r.id })}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
              borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
            }}
          >
            <View style={{
              width: 42, height: 42, borderRadius: 13,
              backgroundColor: potBg(F, ['cream','mint','sky','blush','butter'][i % 5]),
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 20 }}>{r.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>{r.merchant}</Text>
              <Text style={{ fontSize: 12, color: F.ink2 }}>
                {r.cat}{'  '}{r.mood}
                {'  '}<Text style={{ fontSize: 11, color: F.ink3 }}>{r.time}</Text>
              </Text>
            </View>
            <Text style={{ fontSize: 16, color: F.ink }}>−{sym}{r.amount.toFixed(2)}</Text>
          </TouchableOpacity>
        ))}

        {/* View all */}
        <TouchableOpacity
          onPress={() => navigation.navigate('AllExpenses')}
          activeOpacity={0.7}
          style={{ padding: 14, borderTopWidth: 1, borderTopColor: F.line, alignItems: 'center' }}
        >
          <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>View all transactions →</Text>
        </TouchableOpacity>
      </View>

      {/* ── Forecast nudge ── */}
      <View style={{ backgroundColor: F.cream, borderRadius: 22, padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <Text style={{ fontSize: 32 }}>🌱</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: F.ink, fontStyle: 'italic' }}>
              You're trending lighter.
            </Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: F.ink2, lineHeight: 20 }}>
              May ends near{' '}
              <Text style={{ color: F.coral, fontWeight: '700' }}>{sym}2,540</Text>
              {' '}— about {sym}260 under budget.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Trends')}
              activeOpacity={0.7}
              style={{ marginTop: 10 }}
            >
              <Text style={{ color: F.coral, fontSize: 13, fontWeight: '700' }}>
                See full analytics →
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
