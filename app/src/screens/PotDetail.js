import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../hooks/useAppState';
import { ProgressBar } from '../components/UI';
import { potBg } from '../theme';

export default function PotDetail({ route, navigation }) {
  const { potKey } = route.params;
  const { F, sym, pots, expenses } = useApp();
  const insets = useSafeAreaInsets();

  const pot = pots.find(p => p.key === potKey);
  if (!pot) return (
    <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: F.ink2 }}>Pot not found.</Text>
    </View>
  );

  const potExpenses = expenses.filter(e => e.potKey === potKey);
  const pct = pot.spend / pot.budget;
  const over = pct > 1;

  // Group by date label
  const grouped = potExpenses.reduce((acc, e) => {
    const key = e.time?.split('·')[0]?.trim() || e.time || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      {/* Hero card */}
      <View style={{
        backgroundColor: potBg(F, pot.color),
        margin: 16, borderRadius: 24, padding: 22,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Text style={{ fontSize: 32 }}>{pot.emoji}</Text>
          <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>{pot.label}</Text>
        </View>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Spent this month</Text>
        <Text style={{ fontSize: 48, color: F.ink, fontWeight: '400', lineHeight: 54, marginTop: 2 }}>
          {sym}{pot.spend.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginTop: 2 }}>
          of {sym}{pot.budget} budget
          {over && (
            <Text style={{ color: F.coral }}>  · over by {sym}{(pot.spend - pot.budget).toFixed(2)}</Text>
          )}
        </Text>

        <ProgressBar value={pot.spend} max={pot.budget}
          color={over ? F.coral : F.sageD} F={F} height={8}
          style={{ marginTop: 14 }}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ fontSize: 12, color: F.ink2 }}>{Math.round(pct * 100)}% used</Text>
          <Text style={{ fontSize: 12, color: F.ink2 }}>
            {sym}{Math.max(0, pot.budget - pot.spend).toFixed(2)} left
          </Text>
        </View>
      </View>

      {/* Transaction list */}
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 18, color: F.ink, marginBottom: 14 }}>
          Transactions{potExpenses.length > 0 ? ` (${potExpenses.length})` : ''}
        </Text>

        {potExpenses.length === 0 ? (
          <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 40,
            alignItems: 'center', borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>{pot.emoji}</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>No spends here yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4 }}>
              Tap + to add your first {pot.label} expense
            </Text>
          </View>
        ) : (
          Object.entries(grouped).map(([dateGroup, groupExpenses]) => (
            <View key={dateGroup} style={{ marginBottom: 20 }}>
              {/* Date header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: F.ink2 }}>{dateGroup}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: F.line }}/>
                <Text style={{ fontSize: 12, color: F.ink3 }}>
                  {sym}{groupExpenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                </Text>
              </View>

              {/* Expenses for this date */}
              <View style={{ backgroundColor: F.surface, borderRadius: 20,
                borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
                {groupExpenses.map((e, i) => (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() => navigation.navigate('Detail', { id: e.id })}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      padding: 14,
                      borderTopWidth: i > 0 ? 1 : 0, borderTopColor: F.line,
                    }}
                  >
                    {/* Icon */}
                    <View style={{
                      width: 44, height: 44, borderRadius: 14,
                      backgroundColor: potBg(F, pot.color),
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 20 }}>{e.icon}</Text>
                    </View>

                    {/* Merchant + time */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: F.ink }}>{e.merchant}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        {/* Time — show the time part after · if present */}
                        <Text style={{ fontSize: 12, color: F.ink3 }}>
                          {e.time?.includes('·') ? e.time.split('·')[1]?.trim() : e.time}
                        </Text>
                        <Text style={{ fontSize: 13 }}>{e.mood}</Text>
                        {e.recurring && (
                          <View style={{ backgroundColor: F.lilac, borderRadius: 99,
                            paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, color: F.ink2, fontWeight: '600' }}>recurring</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Amount + carbon */}
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={{ fontSize: 17, color: F.ink, fontWeight: '500' }}>
                        −{sym}{e.amount.toFixed(2)}
                      </Text>
                      <Text style={{ fontSize: 11, color: F.sageD }}>
                        {e.carbon} kg CO₂
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
