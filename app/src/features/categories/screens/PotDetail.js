import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { ProgressBar } from '@components/primitives/ProgressBar';
import { potBg } from '../../../theme';

function PotDetail({ route, navigation }) {
  const { potId } = route.params;
  const { F, sym, pots, expenses } = useApp();
  const insets = useSafeAreaInsets();

  const pot = pots.find(p => p.id === potId);
  if (!pot) return (
    <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: F.ink2 }}>Pot not found.</Text>
    </View>
  );

  const potExpenses = expenses.filter(e => e.category_id === potId);
  const pct = pot.budget > 0 ? pot.spend / pot.budget : 0;
  const over = pct > 1;

  const grouped = potExpenses.reduce((acc, e) => {
    const key = e.expense_date || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      <View style={{
        backgroundColor: potBg(F, pot.color),
        margin: 16, borderRadius: 24, padding: 22,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 32 }}>{pot.emoji}</Text>
            <Text style={{ fontSize: 22, color: F.ink, fontWeight: '500' }}>{pot.label}</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditPot', { id: pot.id })}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${pot.label} pot`}
            style={{ backgroundColor: F.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}
          >
            <Text style={{ fontSize: 12, color: F.ink, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Spent this month</Text>
        <Text style={{ fontSize: 48, color: F.ink, fontWeight: '400', lineHeight: 54, marginTop: 2 }}>
          {sym}{pot.spend.toFixed(2)}
        </Text>
        {pot.budget > 0 ? (
          <>
            <Text style={{ fontSize: 13, color: F.ink2, marginTop: 2 }}>
              of {sym}{pot.budget} budget
              {over && (
                <Text style={{ color: F.coral }}>  · ⚠ over by {sym}{(pot.spend - pot.budget).toFixed(2)}</Text>
              )}
            </Text>
            <ProgressBar value={pot.spend} max={pot.budget}
              color={over ? F.coral : F.sageD} F={F} height={8}/>
            {/* 2.D.19 — glyph prefix on the status labels. ⚠ over signals
                breach; ✓ left signals safe. Color stays as redundant cue. */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: F.ink2 }}>
                {over ? '⚠ ' : '✓ '}{Math.round(pct * 100)}% used
              </Text>
              <Text style={{ fontSize: 12, color: F.ink2 }}>
                {sym}{Math.max(0, pot.budget - pot.spend).toFixed(2)} left
              </Text>
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 2 }}>no budget set</Text>
        )}
      </View>

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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: F.ink2 }}>{dateGroup}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: F.line }}/>
                <Text style={{ fontSize: 12, color: F.ink3 }}>
                  {sym}{groupExpenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                </Text>
              </View>
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
                    <View style={{
                      width: 44, height: 44, borderRadius: 14,
                      backgroundColor: potBg(F, pot.color),
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 20 }}>{pot.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: F.ink }}>{e.merchant}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        {e.mood && <Text style={{ fontSize: 13 }}>{e.mood}</Text>}
                        {e.recurring && (
                          <View style={{ backgroundColor: F.lilac, borderRadius: 99,
                            paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, color: F.ink2, fontWeight: '600' }}>recurring</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 17, color: F.ink, fontWeight: '500' }}>
                        −{sym}{e.amount.toFixed(2)}
                      </Text>
                      {e.carbon ? (
                        <Text style={{ fontSize: 11, color: F.sageD }}>
                          {e.carbon} kg CO₂
                        </Text>
                      ) : null}
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

export default React.memo(PotDetail);
