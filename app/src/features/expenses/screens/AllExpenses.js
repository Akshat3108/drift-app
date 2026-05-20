import React, { useState, useMemo, useCallback, useLayoutEffect, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useExpenses } from '@features/expenses/context';
import { potBg } from '../../../theme';
import { logError } from '@core/utils/log';
import { expenses as expRepo } from '@features/expenses/repo';
import FilterSheet from '@features/expenses/components/FilterSheet';
import CategoryPickerSheet from '@features/expenses/components/CategoryPickerSheet';
import { hasActiveFilters, criteriaToHumanLabel, normalizeCriteria, PAYMENT_EMOJI } from '@features/expenses/filters';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';

const SELECTION_CAP = 500;

function AllExpenses({ navigation, route }) {
  const { F, sym, pots, expenses, refresh } = useApp();
  const { bulkRemoveExpenses, bulkRestoreExpenses, bulkRecategorizeExpenses, removeExpense, restoreExpense } = useExpenses();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const initialPot = route.params?.potId || 'all';
  const [filter, setFilter] = useState(initialPot);
  const [refreshing, setRefreshing] = useState(false);

  // 5.8 — batch selection state. `selectedIds` is a Set for O(1) toggle; the
  // mode is derived (any selection => active).
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectionMode = selectedIds.size > 0;
  const [pickerOpen, setPickerOpen] = useState(false);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size >= SELECTION_CAP) return prev;
      else next.add(id);
      return next;
    });
  }, []);

  // 5.3 — saved-filter criteria + FilterSheet visibility. When `criteria`
  // contains any active filter beyond the legacy category pill, we bypass
  // the in-memory ExpensesProvider feed and query SQL directly so the
  // FilterSheet axes (date, amount, mood, …) work without bloating context.
  const [criteria, setCriteria] = useState({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sqlRows, setSqlRows] = useState(null);   // null = not using SQL feed
  const [sqlLoading, setSqlLoading] = useState(false);

  // 5.2 — 🔍 header icon opens Search modal. Light-touch entry point that
  // keeps the tab bar at 4 routes. 5.8 — while selection mode is active,
  // swap the header for a "N selected · ✕" affordance so the user sees the
  // mode + has an obvious exit.
  useLayoutEffect(() => {
    if (selectionMode) {
      navigation.setOptions({
        headerTitle: `${selectedIds.size} selected`,
        headerRight: () => (
          <TouchableOpacity
            onPress={clearSelection}
            activeOpacity={0.7}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 16, color: F.coral, fontWeight: '700' }}>Done</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        headerTitle: 'All transactions',
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Search')}
            activeOpacity={0.7}
            style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
            <Text style={{ fontSize: 18 }}>🔍</Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, selectionMode, selectedIds.size, clearSelection, F.coral]);

  // 5.8 — Android hardware back exits selection mode before falling through
  // to navigation.goBack(). Only attaches the handler when the mode is on.
  useEffect(() => {
    if (!selectionMode) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      clearSelection();
      return true;
    });
    return () => sub.remove();
  }, [selectionMode, clearSelection]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (sqlRows == null) {
        await refresh();
      } else {
        const rows = await expRepo.list({ criteria, limit: 500 });
        setSqlRows(rows);
      }
    } catch (e) {
      logError('allexpenses.refresh', e);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, sqlRows, criteria]);

  // 5.3 — when criteria changes, fetch from SQL; when it becomes empty,
  // fall back to the in-memory ExpensesProvider feed.
  useEffect(() => {
    let cancelled = false;
    if (!hasActiveFilters(criteria)) {
      setSqlRows(null);
      return undefined;
    }
    setSqlLoading(true);
    (async () => {
      try {
        const rows = await expRepo.list({ criteria, limit: 500 });
        if (!cancelled) setSqlRows(rows);
      } catch (e) {
        if (!cancelled) setSqlRows([]);
        logError('allexpenses.sqlfeed', e);
      } finally {
        if (!cancelled) setSqlLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [criteria]);

  // 5.3 — category pill row still works as a quick toggle. It writes into
  // criteria.categoryIds so the pill state and the FilterSheet state stay
  // in lockstep.
  const onPillPress = (potId) => {
    setFilter(potId);
    if (potId === 'all') {
      setCriteria((c) => ({ ...c, categoryIds: undefined }));
    } else {
      setCriteria((c) => ({ ...c, categoryIds: [potId] }));
    }
  };

  const usingSql = sqlRows != null;
  const sourceRows = usingSql ? sqlRows : expenses;

  const filtered = useMemo(
    () => usingSql
      ? sourceRows
      // legacy in-memory pill filter; only active when criteria is empty.
      : (filter === 'all' ? expenses : expenses.filter((e) => e.category_id === filter)),
    [usingSql, sourceRows, filter, expenses],
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      const day = e.expense_date || 'Other';
      if (!map[day]) map[day] = [];
      map[day].push(e);
    });
    return map;
  }, [filtered]);

  const filterPillLabel = useMemo(
    () => hasActiveFilters(criteria)
      ? criteriaToHumanLabel(criteria, {
        categoryMap: Object.fromEntries((pots || []).map((p) => [p.id, p])),
      })
      : 'Filter',
    [criteria, pots]
  );

  // 5.8 — batch action handlers. All three reuse `Array.from(selectedIds)` so
  // the order of operations is consistent and the Set state stays the source.
  const runBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await bulkRemoveExpenses(ids);
      clearSelection();
      if (hasActiveFilters(criteria)) {
        const rows = await expRepo.list({ criteria, limit: 500 });
        setSqlRows(rows);
      }
      toast(`Deleted ${ids.length} spend${ids.length === 1 ? '' : 's'}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await bulkRestoreExpenses(ids);
            if (hasActiveFilters(criteria)) {
              const rows = await expRepo.list({ criteria, limit: 500 });
              setSqlRows(rows);
            }
          } catch (err) {
            logError('allexpenses.bulkrestore', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (e) {
      logError('allexpenses.bulkremove', e);
      Alert.alert('Delete failed', e?.message || String(e));
    }
  }, [selectedIds, bulkRemoveExpenses, bulkRestoreExpenses, clearSelection, criteria, toast]);

  const runBatchRecategorize = useCallback(async (category_id) => {
    setPickerOpen(false);
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const target = (pots || []).find((p) => p.id === category_id);
    const targetLabel = category_id == null
      ? 'no category'
      : `${target?.emoji || '💰'} ${target?.label || target?.name || 'category'}`;
    Alert.alert(
      `Move ${ids.length} spend${ids.length === 1 ? '' : 's'}?`,
      `New category: ${targetLabel}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move', onPress: async () => {
          try {
            await bulkRecategorizeExpenses(ids, category_id);
            clearSelection();
            if (hasActiveFilters(criteria)) {
              const rows = await expRepo.list({ criteria, limit: 500 });
              setSqlRows(rows);
            }
          } catch (e) {
            logError('allexpenses.bulkrecat', e);
            Alert.alert('Recategorize failed', e?.message || String(e));
          }
        }},
      ]
    );
  }, [selectedIds, pots, bulkRecategorizeExpenses, clearSelection, criteria]);

  const runBatchExport = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    navigation.navigate('Export', { ids });
  }, [selectedIds, navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: F.line, backgroundColor: F.surface }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        <FilterPill active={filter === 'all' && !hasActiveFilters(criteria)}
          onPress={() => { setFilter('all'); setCriteria({}); }} F={F}>All</FilterPill>
        {pots.map((p) => (
          <FilterPill key={p.id} active={filter === p.id} onPress={() => onPillPress(p.id)} F={F}>
            {p.emoji} {p.label}
          </FilterPill>
        ))}
        <TouchableOpacity onPress={() => setSheetOpen(true)} activeOpacity={0.75}
          style={{
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
            backgroundColor: hasActiveFilters(criteria) ? F.coral : F.cream,
            borderWidth: 1, borderColor: hasActiveFilters(criteria) ? F.coral : F.line,
          }}>
          <Text style={{ fontSize: 12, fontWeight: '700',
            color: hasActiveFilters(criteria) ? '#fff' : F.ink }}>
            🎚 {filterPillLabel}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          // 5.8 — extra bottom space when the action bar is up so the last
          // row isn't hidden under it.
          paddingBottom: insets.bottom + (selectionMode ? 96 : 40),
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
        <View style={{ backgroundColor: F.cream, borderRadius: 20, padding: 18, marginBottom: 18 }}>
          <Text style={{ fontSize: 12, color: F.ink2 }}>
            {filtered.length} {filtered.length === 1 ? 'spend' : 'spends'}
            {filter !== 'all' && !hasActiveFilters(criteria) && ` · ${pots.find(p => p.id === filter)?.label || ''}`}
            {sqlLoading && ' · loading…'}
          </Text>
          <Text style={{ fontSize: 38, color: F.ink, fontWeight: '400', marginTop: 4 }}>
            {sym}{total.toFixed(2)}
          </Text>
        </View>

        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🌱</Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>Nothing here yet</Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4 }}>
              {hasActiveFilters(criteria) ? 'Try loosening the filter' : 'Tap + to add a spend'}
            </Text>
          </View>
        ) : (
          Object.entries(grouped).map(([day, items]) => (
            <View key={day} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: F.ink2 }}>{day}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: F.line }}/>
                <Text style={{ fontSize: 12, color: F.ink3 }}>
                  {sym}{items.reduce((s, e) => s + e.amount, 0).toFixed(2)}
                </Text>
              </View>
              <View style={{ backgroundColor: F.surface, borderRadius: 18,
                borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
                {items.map((e, i) => {
                  const isSelected = selectedIds.has(e.id);
                  const onSwipeDelete = async () => {
                    try {
                      await removeExpense(e.id);
                      toast(`Deleted: ${e.merchant}`, {
                        actionLabel: 'Undo',
                        onAction: async () => {
                          try { await restoreExpense(e.id); }
                          catch (err) {
                            logError('allexpenses:swipe-restore', err);
                            Alert.alert('Restore failed', err?.message || String(err));
                          }
                        },
                      });
                    } catch (err) {
                      logError('allexpenses:swipe-delete', err);
                      Alert.alert('Delete failed', err?.message || String(err));
                    }
                  };
                  return (
                    <SwipeableRow key={e.id} F={F} enabled={!selectionMode} onRightAction={onSwipeDelete}>
                    <TouchableOpacity
                      onPress={() => {
                        if (selectionMode) toggleSelect(e.id);
                        else navigation.navigate('Detail', { id: e.id });
                      }}
                      onLongPress={() => toggleSelect(e.id)}
                      delayLongPress={250}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                        borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                        borderLeftWidth: isSelected ? 4 : 0, borderLeftColor: F.coral,
                        backgroundColor: isSelected ? F.cream : F.surface,
                      }}>
                      <View style={{
                        width: 42, height: 42, borderRadius: 13,
                        backgroundColor: potBg(F, e.category_color || 'cream'),
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 20 }}>{isSelected ? '✓' : (e.category_emoji || '💰')}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }}>{e.merchant}</Text>
                        <Text style={{ fontSize: 12, color: F.ink2 }}>
                          {e.payment_method ? `${PAYMENT_EMOJI[e.payment_method] || ''} ` : ''}
                          {e.category_name || 'Uncategorised'}{e.mood ? `  ${e.mood}` : ''}
                          {e.recurring ? '  · recurring' : ''}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 16, color: F.ink }}>−{sym}{e.amount.toFixed(2)}</Text>
                    </TouchableOpacity>
                    </SwipeableRow>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setCriteria(normalizeCriteria(next));
          // Sync the visual category pill: when criteria has exactly one
          // categoryId, surface it on the pill row; otherwise show "All".
          const ids = next.categoryIds || [];
          setFilter(ids.length === 1 ? ids[0] : 'all');
        }}
        initialCriteria={criteria}
      />

      {/* 5.8 — batch action bar. Fixed to the bottom of the screen, above the
          safe-area inset, only mounted while selection is active. */}
      {selectionMode && (
        <View style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          paddingHorizontal: 12, paddingTop: 10,
          paddingBottom: insets.bottom + 10,
          backgroundColor: F.surface,
          borderTopWidth: 1, borderTopColor: F.line,
          flexDirection: 'row', gap: 8,
        }}>
          <ActionBtn F={F} icon="🗂" label="Recategorize" onPress={() => setPickerOpen(true)}/>
          <ActionBtn F={F} icon="📤" label="Export" onPress={runBatchExport}/>
          <ActionBtn F={F} icon="🗑" label="Delete" destructive onPress={runBatchDelete}/>
        </View>
      )}

      <CategoryPickerSheet
        visible={pickerOpen}
        count={selectedIds.size}
        onClose={() => setPickerOpen(false)}
        onPick={runBatchRecategorize}
      />
    </View>
  );
}

function ActionBtn({ F, icon, label, destructive, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={{
        flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
        backgroundColor: destructive ? '#fbe6e3' : F.cream,
        borderWidth: 1, borderColor: destructive ? '#f1c5be' : F.line,
      }}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={{ fontSize: 11, color: destructive ? '#c75a4d' : F.ink, fontWeight: '700', marginTop: 2 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FilterPill({ active, onPress, F, children }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
        backgroundColor: active ? F.coral : F.cream,
        borderWidth: 1, borderColor: active ? F.coral : F.line,
      }}>
      <Text style={{
        fontSize: 12, fontWeight: active ? '700' : '500',
        color: active ? '#fff' : F.ink,
      }}>{children}</Text>
    </TouchableOpacity>
  );
}

export default React.memo(AllExpenses);
