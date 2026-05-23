import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { ProgressBar } from '@components/primitives/ProgressBar';
import { potBg } from '../../../theme';
import { logError } from '@core/utils/log';
import { formatShort, shorten, daysUntilLabel } from '@core/utils/format';
import { useHomeDashboard } from '../useHomeDashboard';

function Home({ navigation }) {
  const { F, sym, profile, pots, expenses, totalSpend, totalIncome, monthBudget, refresh } = useApp();
  const { net, nextTrip, streak, topMover, refresh: refreshDashboard } = useHomeDashboard();
  const insets = useSafeAreaInsets();
  const left = Math.max(0, monthBudget - totalSpend);
  const leftCents = ((left % 1) * 100).toFixed(0).padStart(2, '0');

  // 5.6 — savings rate = (income - expenses) / income, current month.
  // Negative-income (over-spent) cases display rate at 0 but show the gap
  // verbally; this keeps the widget honest without flashing red on a Home
  // that already has the budget-overrun forecast block at the bottom.
  const savings = totalIncome - totalSpend;
  const savingsRate = totalIncome > 0
    ? Math.max(0, Math.min(100, Math.round((savings / totalIncome) * 100)))
    : 0;
  const showSavings = totalIncome > 0;
  const savingsPositive = savings >= 0;

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshDashboard()]);
    } catch (e) {
      logError('home.refresh', e);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshDashboard]);

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const forecast = dayOfMonth > 0 ? +(totalSpend * daysInMonth / dayOfMonth).toFixed(0) : 0;
  const forecastDelta = monthBudget > 0 ? monthBudget - forecast : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 100,
        paddingHorizontal: 20,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={F.coral}
          colors={[F.coral]}
        />
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20 }}>
        <View>
          <Text style={{ fontSize: 13, color: F.ink2 }}>Hello,</Text>
          <Text style={{ fontSize: 28, color: F.ink, fontWeight: '400' }}>
            Hi <Text style={{ fontStyle: 'italic' }}>{profile?.name?.split(' ')[0] || 'there'}</Text>{' '}
            <Text style={{ color: F.coral }}>✿</Text>
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Search')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Search"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: F.cream,
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: F.line }}
          >
            <Text style={{ fontSize: 18 }}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: F.cream,
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: F.line }}
          >
            <Text style={{ fontSize: 18, color: F.coral, fontWeight: '600' }}>{profile?.avatar || 'U'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 20 }}>
        <Text style={{ fontSize: 11, color: F.ink2 }}>
          {monthBudget > 0 ? 'You have' : 'Spent this month'}
        </Text>
        <Text style={{ fontSize: 52, color: F.ink, fontWeight: '400', lineHeight: 58, marginTop: 4 }}>
          {sym}{Math.floor(monthBudget > 0 ? left : totalSpend).toLocaleString()}
          <Text style={{ fontSize: 28, color: F.ink3 }}>
            .{monthBudget > 0 ? leftCents : ((totalSpend % 1) * 100).toFixed(0).padStart(2, '0')}
          </Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
          {monthBudget > 0 ? 'left to spend this month' : 'no budgets set yet'}
        </Text>

        {totalSpend > 0 && (
          <TouchableOpacity
            onPress={() => navigation.navigate('SpendCalendar')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityLabel="View spending calendar"
            style={{ alignSelf: 'flex-start', marginTop: 8 }}>
            <Text style={{ color: F.coral, fontSize: 12, fontWeight: '600' }}>
              View calendar →
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('NetWorth')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={net ? `Net worth ${sym}${formatShort(net.net)}` : 'Set up net worth'}
            style={{ flex: 1, backgroundColor: F.surface, borderRadius: 14, padding: 14,
              borderWidth: 1, borderColor: F.line }}
          >
            <Text style={{ fontSize: 10, color: F.ink3 }}>Net worth</Text>
            <Text style={{ fontSize: 20, color: F.ink, marginTop: 3 }}>
              {net ? `${sym}${formatShort(net.net)}` : 'Set up →'}
            </Text>
            {net && net.liabilities > 0 && (
              <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>
                −{sym}{formatShort(net.liabilities)} owed
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('Travel')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={nextTrip ? `Travel: next trip to ${nextTrip.destination || nextTrip.name}` : 'Plan a trip'}
            style={{ flex: 1, backgroundColor: F.surface, borderRadius: 14, padding: 14,
              borderWidth: 1, borderColor: F.line }}
          >
            <Text style={{ fontSize: 10, color: F.ink3 }}>Travel</Text>
            <Text style={{ fontSize: 20, color: F.ink, marginTop: 3 }}>
              {nextTrip ? `✈ ${shorten(nextTrip.destination || nextTrip.name)}` : 'Plan a trip'}
            </Text>
            {nextTrip && (
              <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>
                {daysUntilLabel(nextTrip.start_date)}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {showSavings && (
        <View style={{ backgroundColor: F.cream, borderRadius: 22, padding: 18, marginBottom: 20,
          flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: F.surface,
            alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 18, color: savingsPositive ? F.sageD : F.coral, fontWeight: '700' }}>
              {savingsRate}%
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>SAVINGS RATE</Text>
            <Text style={{ fontSize: 15, color: F.ink, marginTop: 4 }}>
              {savingsPositive
                ? <>{sym}{Math.floor(savings).toLocaleString()} saved </>
                : <>Over by {sym}{Math.floor(-savings).toLocaleString()} </>}
              <Text style={{ color: F.ink3 }}>· of {sym}{Math.floor(totalIncome).toLocaleString()} income</Text>
            </Text>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 12 }}>
        <Text style={{ fontSize: 19, color: F.ink }}>Your pots</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Trends')} activeOpacity={0.7}>
          <Text style={{ fontSize: 13, color: F.coral, fontWeight: '600' }}>see all</Text>
        </TouchableOpacity>
      </View>

      {pots.length === 0 ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 24,
          borderWidth: 1, borderColor: F.line, alignItems: 'center', marginBottom: 24 }}>
          <Text style={{ fontSize: 13, color: F.ink2 }}>No categories yet</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          {pots.map(p => {
            const pct = p.budget > 0 ? p.spend / p.budget : 0;
            const over = pct > 1;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => navigation.navigate('PotDetail', { potId: p.id, potName: `${p.emoji} ${p.label}` })}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${p.label}: ${sym}${p.spend.toFixed(0)}${p.budget > 0 ? ` of ${sym}${p.budget}, ${Math.round((p.spend / p.budget) * 100)} percent used` : ''}`}
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
                  {p.budget > 0 ? `of ${sym}${p.budget}` : 'no budget'}
                </Text>
                {p.budget > 0 && (
                  <>
                    <ProgressBar
                      value={p.spend} max={p.budget}
                      color={over ? F.coral : F.sageD} F={F} height={4}
                    />
                    {/* 2.D.19 — glyph prefix is the non-color signal: ⚠ over,
                        ✓ under. Removes the colorblind dependency on coral. */}
                    <Text style={{ fontSize: 10, color: over ? F.coral : F.ink3, marginTop: 4, textAlign: 'right' }}>
                      {over ? '⚠ ' : '✓ '}{Math.round(pct * 100)}% used →
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {streak >= 1 && (
        <View style={{ backgroundColor: F.cream, borderRadius: 18, padding: 16,
          flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: F.surface,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24 }}>🔥</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: F.ink }}>
              <Text style={{ fontStyle: 'italic' }}>{streak}-day</Text> streak — under budget
            </Text>
            <Text style={{ fontSize: 12, color: F.ink2, marginTop: 2 }}>
              Keep going ✿
            </Text>
          </View>
        </View>
      )}

      {topMover && (
        <TouchableOpacity
          onPress={() => navigation.navigate('Items', { filter: 'produce' })}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Price watch: ${topMover.display_name} ${topMover.change_pct > 0 ? 'up' : 'down'} ${Math.abs(topMover.change_pct).toFixed(0)} percent, now ${sym}${topMover.last_unit_price.toFixed(0)} per ${topMover.canonical_unit}`}
          style={{ backgroundColor: F.mint, borderRadius: 18, padding: 16,
            flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 }}
        >
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: F.surface,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24 }}>🥬</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>PRICE WATCH</Text>
            <Text style={{ fontSize: 15, color: F.ink, marginTop: 2 }}>
              <Text style={{ fontStyle: 'italic', textTransform: 'capitalize' }}>{topMover.display_name}</Text>{' '}
              <Text style={{ color: topMover.change_pct > 0 ? F.coral : F.sageD, fontWeight: '700' }}>
                {topMover.change_pct > 0 ? '↑' : '↓'} {Math.abs(topMover.change_pct).toFixed(0)}%
              </Text>
            </Text>
            <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>
              now {sym}{topMover.last_unit_price.toFixed(0)}/{topMover.canonical_unit}
            </Text>
          </View>
          <Text style={{ fontSize: 18, color: F.ink3 }}>›</Text>
        </TouchableOpacity>
      )}

      {expenses.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between',
            alignItems: 'baseline', marginBottom: 12 }}>
            <Text style={{ fontSize: 19, color: F.ink }}>Recent</Text>
            <Text style={{ fontSize: 12, color: F.ink3 }}>{expenses.length} this month</Text>
          </View>

          <View style={{ backgroundColor: F.surface, borderRadius: 20,
            borderWidth: 1, borderColor: F.line, overflow: 'hidden', marginBottom: 24 }}>
            {expenses.slice(0, 5).map((r, i) => (
              <TouchableOpacity
                key={r.id}
                onPress={() => navigation.navigate('Detail', { id: r.id })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${r.merchant}, ${sym}${r.amount.toFixed(2)}, ${r.category_name || 'uncategorised'}, ${r.expense_date}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                  borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                }}
              >
                <View style={{
                  width: 42, height: 42, borderRadius: 13,
                  backgroundColor: potBg(F, r.category_color || 'cream'),
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 20 }}>{r.category_emoji || '💰'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>{r.merchant}</Text>
                  <Text style={{ fontSize: 12, color: F.ink2 }}>
                    {r.category_name || 'Uncategorised'}{r.mood ? `  ${r.mood}` : ''}
                    {'  '}<Text style={{ fontSize: 11, color: F.ink3 }}>{r.expense_date}</Text>
                  </Text>
                </View>
                <Text style={{ fontSize: 16, color: F.ink }}>−{sym}{r.amount.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => navigation.navigate('AllExpenses')}
              activeOpacity={0.7}
              style={{ padding: 14, borderTopWidth: 1, borderTopColor: F.line, alignItems: 'center' }}
            >
              <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>View all transactions →</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {monthBudget > 0 && totalSpend > 0 && (
        <View style={{ backgroundColor: F.cream, borderRadius: 22, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Text style={{ fontSize: 32 }}>{forecastDelta >= 0 ? '🌱' : '⚠️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, color: F.ink, fontStyle: 'italic' }}>
                {forecastDelta >= 0 ? "You're trending lighter." : "Watch your spend."}
              </Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: F.ink2, lineHeight: 20 }}>
                On this pace, you'll end at{' '}
                <Text style={{ color: F.coral, fontWeight: '700' }}>{sym}{forecast.toLocaleString()}</Text>
                {' '}— about {sym}{Math.abs(forecastDelta).toLocaleString()} {forecastDelta >= 0 ? 'under' : 'over'} budget.
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
      )}

      {expenses.length === 0 && (
        <View style={{ backgroundColor: F.cream, borderRadius: 22, padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🌱</Text>
          <Text style={{ fontSize: 15, color: F.ink, fontWeight: '500' }}>Nothing logged yet</Text>
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 4, textAlign: 'center' }}>
            Tap + below to add a spend, or 📷 to scan a receipt.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}


export default React.memo(Home);
