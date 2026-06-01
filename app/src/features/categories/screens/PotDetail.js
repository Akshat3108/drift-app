import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { ProgressBar } from '@components/primitives/ProgressBar';
import PotExpenseRow from '@features/categories/components/PotExpenseRow';
import { potBg } from '../../../theme';
import { categoryCashflowForecast } from '../../../analytics';

// PS-28 — compact confidence cone: a min..max band with the ensemble marker,
// the current-spend fill, and a budget tick, all on one scaled track. Pure
// View math (no SVG) so it sits naturally under the pot's budget strip.
function ForecastCone({ forecast, F, sym }) {
  const { range, ensemble, current_spend: cur, budget } = forecast;
  const scaleMax = Math.max(range.max, budget || 0, ensemble, 1) * 1.08;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`;
  const over = budget != null && ensemble > budget;
  const accent = over ? F.coral : F.sageD;
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ height: 12, borderRadius: 6, backgroundColor: F.cream, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: pct(range.min), width: pct(range.max - range.min),
          height: 12, backgroundColor: accent, opacity: 0.25 }} />
        <View style={{ position: 'absolute', left: 0, width: pct(cur), height: 12,
          backgroundColor: accent, opacity: 0.55 }} />
        <View style={{ position: 'absolute', left: pct(ensemble), width: 2, height: 12, backgroundColor: F.ink }} />
        {budget != null && (
          <View style={{ position: 'absolute', left: pct(budget), width: 2, height: 12, backgroundColor: F.coral }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 10, color: F.ink3 }}>now {sym}{Math.round(cur).toLocaleString()}</Text>
        <Text style={{ fontSize: 10, color: F.ink3 }}>
          range {sym}{Math.round(range.min).toLocaleString()}–{sym}{Math.round(range.max).toLocaleString()}
        </Text>
      </View>
    </View>
  );
}

function PotDetail({ route, navigation }) {
  const { potId } = route.params;
  const { F, sym, pots, expenses, settings } = useApp();
  const insets = useSafeAreaInsets();

  const pot = pots.find(p => p.id === potId);

  // PS-28 — per-category month-end projection (async; recomputes per pot +
  // when the pot's spend changes so the cone tracks fresh saves).
  const [forecast, setForecast] = useState(null);
  const potSpend = pot?.spend;
  useEffect(() => {
    let cancelled = false;
    if (potId == null) { setForecast(null); return; }
    categoryCashflowForecast(potId)
      .then((f) => { if (!cancelled) setForecast(f); })
      .catch(() => { if (!cancelled) setForecast(null); });
    return () => { cancelled = true; };
  }, [potId, potSpend]);

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

  // PS-36 — sub-pot rollup is pure JS over the in-memory pots array (every
  // category's leaf spend is already loaded). monthly_summary stays leaf-keyed;
  // we never double-count because each pot row carries only its OWN spend.
  const children = useMemo(
    () => (pots || []).filter((p) => p.parent_id === potId),
    [pots, potId],
  );
  const parentPot = useMemo(
    () => (pot?.parent_id != null ? (pots || []).find((p) => p.id === pot.parent_id) : null),
    [pots, pot?.parent_id],
  );
  const rollup = useMemo(() => {
    if (!pot || children.length === 0) return null;
    const childSpend  = children.reduce((s, c) => s + (c.spend || 0), 0);
    const childBudget = children.reduce((s, c) => s + (c.budget || 0), 0);
    return {
      combinedSpend:  (pot.spend || 0) + childSpend,
      combinedBudget: (pot.budget || 0) + childBudget,
    };
  }, [pot, children]);
  const [childrenOpen, setChildrenOpen] = useState(true);

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
      showThumb={!!settings?.show_receipt_thumbnails}
      onPress={onRowPress}
    />
  ), [F, sym, pot, settings?.show_receipt_thumbnails, onRowPress]);

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

          {parentPot && (
            <TouchableOpacity
              onPress={() => navigation.push('PotDetail', { potId: parentPot.id })}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Part of ${parentPot.label}`}
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: F.surface, paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: 99, marginBottom: 10 }}>
              <Text style={{ fontSize: 12 }}>{parentPot.emoji}</Text>
              <Text style={{ fontSize: 11, color: F.ink2, fontWeight: '600' }}>
                Part of {parentPot.label}
              </Text>
            </TouchableOpacity>
          )}

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

        {/* PS-28 — projected month-end + confidence cone. */}
        {forecast?.ready && (
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, padding: 16, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 13, color: F.ink2 }}>Projected month-end</Text>
              <Text style={{ fontSize: 11, color: F.ink3 }}>{forecast.confidence} confidence</Text>
            </View>
            <Text style={{ fontSize: 28, color: F.ink, fontWeight: '500', marginTop: 2 }}>
              {sym}{Math.round(forecast.ensemble).toLocaleString()}
            </Text>
            {forecast.projected_vs_budget != null && (
              <Text style={{ fontSize: 12, marginTop: 2,
                color: forecast.projected_vs_budget > 0 ? F.coral : F.sageD }}>
                {forecast.projected_vs_budget > 0
                  ? `⚠ ${sym}${Math.round(forecast.projected_vs_budget).toLocaleString()} over budget`
                  : `✓ ${sym}${Math.round(Math.abs(forecast.projected_vs_budget)).toLocaleString()} under budget`}
              </Text>
            )}
            <ForecastCone forecast={forecast} F={F} sym={sym} />
          </View>
        )}

        {/* PS-36 — sub-pot rollup. Collapsible list of child pots + combined
            spend/budget. Tap a child to drill into its own detail. */}
        {rollup && (
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, padding: 16, marginTop: 12 }}>
            <TouchableOpacity onPress={() => setChildrenOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: childrenOpen }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: F.ink2, fontWeight: '600' }}>
                Includes {children.length} sub-pot{children.length === 1 ? '' : 's'}
              </Text>
              <Text style={{ fontSize: 13, color: F.ink3 }}>{childrenOpen ? '▾' : '▸'}</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: F.ink3, marginTop: 4 }}>
              Combined {sym}{rollup.combinedSpend.toFixed(2)}
              {rollup.combinedBudget > 0 ? ` of ${sym}${rollup.combinedBudget.toFixed(2)}` : ''}
            </Text>
            {childrenOpen && children.map((c, i) => (
              <TouchableOpacity key={c.id}
                onPress={() => navigation.push('PotDetail', { potId: c.id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingVertical: 10, borderTopWidth: 1, borderTopColor: F.line,
                  marginTop: i === 0 ? 12 : 0 }}>
                <Text style={{ fontSize: 18 }}>{c.emoji}</Text>
                <Text style={{ flex: 1, fontSize: 14, color: F.ink }}>{c.label}</Text>
                <Text style={{ fontSize: 13, color: F.ink2 }}>{sym}{(c.spend || 0).toFixed(2)}</Text>
                <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={{ fontSize: 18, color: F.ink, marginTop: 20 }}>
          Transactions{potExpenses.length > 0 ? ` (${potExpenses.length})` : ''}
        </Text>
      </>
    );
  }, [pot, F, sym, navigation, potExpenses.length, forecast, rollup, children, childrenOpen, parentPot]);

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
