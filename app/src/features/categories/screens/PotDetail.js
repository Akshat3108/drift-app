import React, { useCallback, useMemo } from 'react';
import { View, Text, SectionList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { ProgressBar } from '@components/primitives/ProgressBar';
import PotExpenseRow from '@features/categories/components/PotExpenseRow';
import { potBg } from '../../../theme';

function PotDetail({ route, navigation }) {
  const { potId } = route.params;
  const { F, sym, pots, expenses } = useApp();
  const insets = useSafeAreaInsets();

  const pot = pots.find(p => p.id === potId);

  // 8.2 — All hooks must run unconditionally to satisfy React's rules-of-hooks.
  // Early returns happen at render time AFTER hook calls.
  const potExpenses = useMemo(
    () => pot ? expenses.filter(e => e.category_id === potId) : [],
    [pot, expenses, potId],
  );

  const sections = useMemo(() => {
    const byDay = new Map();
    potExpenses.forEach((e) => {
      const day = e.expense_date || 'Unknown';
      let entry = byDay.get(day);
      if (!entry) {
        entry = { title: day, data: [], total: 0 };
        byDay.set(day, entry);
      }
      entry.data.push(e);
      entry.total += e.amount;
    });
    return Array.from(byDay.values());
  }, [potExpenses]);

  const onRowPress = useCallback((id) => {
    navigation.navigate('Detail', { id });
  }, [navigation]);

  const keyExtractor = useCallback((item) => String(item.id), []);

  const renderItem = useCallback(({ item, index, section }) => (
    <PotExpenseRow
      expense={item}
      F={F}
      sym={sym}
      pot={pot}
      isFirst={index === 0}
      isLast={index === section.data.length - 1}
      onPress={onRowPress}
    />
  ), [F, sym, pot, onRowPress]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
      marginBottom: 8, marginTop: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: F.ink2 }}>{section.title}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: F.line }}/>
      <Text style={{ fontSize: 12, color: F.ink3 }}>
        {sym}{section.total.toFixed(2)}
      </Text>
    </View>
  ), [F, sym]);

  const ListHeader = useMemo(() => {
    if (!pot) return null;
    const rolloverIn = pot.rollover_enabled ? Number(pot.rollover_in) || 0 : 0;
    const effectiveBudget = (pot.budget || 0) + rolloverIn;
    const pct = effectiveBudget > 0 ? pot.spend / effectiveBudget : 0;
    const over = pct > 1;
    return (
      <>
        <View style={{
          backgroundColor: potBg(F, pot.color),
          margin: 0, marginTop: 0, marginBottom: 0,
          borderRadius: 24, padding: 22,
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
                  <Text style={{ color: F.coral }}>  · ⚠ over by {sym}{(pot.spend - effectiveBudget).toFixed(2)}</Text>
                )}
              </Text>
              {pot.rollover_enabled && rolloverIn !== 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <Text style={{ fontSize: 12,
                    color: rolloverIn > 0 ? F.sageD : F.coral, fontWeight: '600' }}>
                    ↻ {rolloverIn > 0 ? '+' : '−'}{sym}{Math.abs(rolloverIn).toFixed(2)} carried in
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    · effective {sym}{effectiveBudget.toFixed(2)}
                  </Text>
                </View>
              )}
              <ProgressBar value={pot.spend} max={effectiveBudget}
                color={over ? F.coral : F.sageD} F={F} height={8}/>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: F.ink2 }}>
                  {over ? '⚠ ' : '✓ '}{Math.round(pct * 100)}% used
                </Text>
                <Text style={{ fontSize: 12, color: F.ink2 }}>
                  {sym}{Math.max(0, effectiveBudget - pot.spend).toFixed(2)} left
                </Text>
              </View>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: F.ink2, marginTop: 2 }}>no budget set</Text>
          )}
        </View>

        <Text style={{ fontSize: 18, color: F.ink, marginTop: 20 }}>
          Transactions{potExpenses.length > 0 ? ` (${potExpenses.length})` : ''}
        </Text>
      </>
    );
  }, [pot, F, sym, navigation, potExpenses.length]);

  const ListEmpty = useMemo(() => {
    if (!pot) return null;
    return (
      <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 40,
        alignItems: 'center', borderWidth: 1, borderColor: F.line, marginTop: 16 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>{pot.emoji}</Text>
        <Text style={{ fontSize: 15, color: F.ink2 }}>No spends here yet</Text>
        <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4 }}>
          Tap + to add your first {pot.label} expense
        </Text>
      </View>
    );
  }, [pot, F]);

  if (!pot) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: F.ink2 }}>Pot not found.</Text>
      </View>
    );
  }

  return (
    <SectionList
      style={{ flex: 1, backgroundColor: F.bg }}
      sections={sections}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      removeClippedSubviews
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={11}
    />
  );
}

export default React.memo(PotDetail);
