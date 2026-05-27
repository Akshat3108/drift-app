import React, { useState, useMemo, useCallback, useLayoutEffect, useEffect } from 'react';
import { View, Text, ScrollView, SectionList, TouchableOpacity, RefreshControl, Alert, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useExpenses } from '@features/expenses/context';
import { logError } from '@core/utils/log';
import { expenses as expRepo } from '@features/expenses/repo';
import FilterSheet from '@features/expenses/components/FilterSheet';
import CategoryPickerSheet from '@features/expenses/components/CategoryPickerSheet';
import TripPickerSheet from '@features/expenses/components/TripPickerSheet';
import ExpenseRow from '@features/expenses/components/ExpenseRow';
import { hasActiveFilters, criteriaToHumanLabel, normalizeCriteria } from '@features/expenses/filters';
import { useToast } from '@components/Toast';
import { withProfiler } from '@core/utils/perf';

const SELECTION_CAP = 500;

function AllExpenses({ navigation, route }) {
  const { F, sym, pots, expenses, trips, refresh } = useApp();
  const { bulkRemoveExpenses, bulkRestoreExpenses, bulkRecategorizeExpenses, bulkRetripExpenses, removeExpense, restoreExpense } = useExpenses();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const initialPot = route.params?.potId || 'all';
  const [filter, setFilter] = useState(initialPot);
  const [refreshing, setRefreshing] = useState(false);

  // 5.F.01 — Archive-mode toggle. When ON, the feed reads from archive_expenses
  // (paged from SQL, not the in-memory 500-row cache) and rows render with
  // reduced opacity. Selection-mode actions stay hidden while archive is on —
  // archive rows are cold storage, not editable through this screen. Hidden
  // pill entirely until the yearly job has actually populated anything.
  const [viewingArchive, setViewingArchive] = useState(false);
  const [archiveCount, setArchiveCount] = useState(0);
  const [archiveRows, setArchiveRows] = useState(null);

  // 5.8 — batch selection state. `selectedIds` is a Set for O(1) toggle; the
  // mode is derived (any selection => active).
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectionMode = selectedIds.size > 0;
  const [pickerOpen, setPickerOpen] = useState(false);
  // PS-07 — when TripDetail's footer CTA navigates here with
  // `route.params.tagToTripId`, surface a hint banner so the user knows
  // their next tap should select expenses to tag. Pre-opening the sheet
  // would be premature (nothing is selected yet); we wait until they
  // long-press a row to enter selection mode and tap "Tag trip".
  const tagHintTripId = route.params?.tagToTripId ?? null;
  const tagHintTrip = (trips || []).find((t) => t.id === tagHintTripId) || null;
  const [tripPickerOpen, setTripPickerOpen] = useState(false);

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

  // 5.3 — saved-filter criteria + FilterSheet visibility. See history for
  // full rationale (preserved verbatim from the ScrollView version).
  const [criteria, setCriteria] = useState(() =>
    normalizeCriteria(route.params?.criteria || {}));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sqlRows, setSqlRows] = useState(null);
  const [sqlLoading, setSqlLoading] = useState(false);

  useLayoutEffect(() => {
    if (selectionMode) {
      navigation.setOptions({
        headerTitle: `${selectedIds.size} selected`,
        headerRight: () => (
          <TouchableOpacity
            onPress={clearSelection}
            activeOpacity={0.7}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Exit selection mode"
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
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Search transactions"
            style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
            <Text style={{ fontSize: 18 }}>🔍</Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, selectionMode, selectedIds.size, clearSelection, F.coral]);

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

  // 5.F.01 — refresh the archive-row count on mount + after every refresh so
  // the pill appears the moment the yearly job stamps its first batch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const n = await expRepo.archiveCount();
        if (!cancelled) setArchiveCount(n);
      } catch (e) {
        if (!cancelled) setArchiveCount(0);
        logError('allexpenses.archivecount', e);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshing]);

  // 5.F.01 — load the archive feed only when the toggle flips ON. Paged at
  // 500 like the live SQL feed; archive is read-rarely so a single page is
  // plenty for the toggle-on use case. Cleared back to null when toggled OFF.
  useEffect(() => {
    let cancelled = false;
    if (!viewingArchive) {
      setArchiveRows(null);
      return undefined;
    }
    (async () => {
      try {
        const rows = await expRepo.listArchive({ limit: 500 });
        if (!cancelled) setArchiveRows(rows);
      } catch (e) {
        if (!cancelled) setArchiveRows([]);
        logError('allexpenses.archivefeed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [viewingArchive]);

  const onPillPress = useCallback((potId) => {
    setFilter(potId);
    if (potId === 'all') {
      setCriteria((c) => ({ ...c, categoryIds: undefined }));
    } else {
      setCriteria((c) => ({ ...c, categoryIds: [potId] }));
    }
  }, []);

  const usingSql = sqlRows != null;
  // 5.F.01 — archive feed wins when toggled ON; falls back to [] until the
  // async loader populates archiveRows. Filters and category pills don't
  // apply in archive mode (we clear criteria on entry — see toggleArchive).
  const usingArchive = viewingArchive;
  const sourceRows = usingArchive
    ? (archiveRows ?? [])
    : (usingSql ? sqlRows : expenses);

  const filtered = useMemo(
    () => {
      if (usingArchive) return sourceRows;
      if (usingSql)     return sourceRows;
      return filter === 'all' ? expenses : expenses.filter((e) => e.category_id === filter);
    },
    [usingArchive, usingSql, sourceRows, filter, expenses],
  );

  const toggleArchive = useCallback(() => {
    setViewingArchive((prev) => {
      const next = !prev;
      if (next) {
        // Entering archive mode — reset the live-feed filter state so the
        // chrome at the top of the screen doesn't claim to filter rows it
        // can't reach.
        setFilter('all');
        setCriteria({});
        clearSelection();
      }
      return next;
    });
  }, [clearSelection]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  // 8.1 — sections shape consumed by SectionList. Each section carries its
  // pre-computed day-total so the section header doesn't have to reduce
  // again per render. month_key key not needed — the day string itself is
  // unique per section.
  const sections = useMemo(() => {
    const byDay = new Map();
    filtered.forEach((e) => {
      const day = e.expense_date || 'Other';
      let entry = byDay.get(day);
      if (!entry) {
        entry = { title: day, data: [], total: 0 };
        byDay.set(day, entry);
      }
      entry.data.push(e);
      entry.total += e.amount;
    });
    return Array.from(byDay.values());
  }, [filtered]);

  const filterPillLabel = useMemo(
    () => hasActiveFilters(criteria)
      ? criteriaToHumanLabel(criteria, {
        categoryMap: Object.fromEntries((pots || []).map((p) => [p.id, p])),
      })
      : 'Filter',
    [criteria, pots]
  );

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

  // PS-07 — batch trip-tag. Mirrors runBatchRecategorize. `trip_id = null`
  // clears the trip tag from every selected row.
  const runBatchRetrip = useCallback(async (trip_id) => {
    setTripPickerOpen(false);
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const target = (trips || []).find((t) => t.id === trip_id);
    const targetLabel = trip_id == null
      ? 'no trip'
      : `✈️ ${target?.destination || target?.name || 'trip'}`;
    Alert.alert(
      `Tag ${ids.length} spend${ids.length === 1 ? '' : 's'}?`,
      `Trip: ${targetLabel}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Tag', onPress: async () => {
          try {
            await bulkRetripExpenses(ids, trip_id);
            clearSelection();
            if (hasActiveFilters(criteria)) {
              const rows = await expRepo.list({ criteria, limit: 500 });
              setSqlRows(rows);
            }
          } catch (e) {
            logError('allexpenses.bulkretrip', e);
            Alert.alert('Tag-to-trip failed', e?.message || String(e));
          }
        }},
      ]
    );
  }, [selectedIds, trips, bulkRetripExpenses, clearSelection, criteria]);

  const runBatchExport = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    navigation.navigate('Export', { ids });
  }, [selectedIds, navigation]);

  // 8.3 — stable per-row callbacks. Each receives the row's id as an
  // argument so the row body doesn't need to capture any closure state,
  // which is what unlocks React.memo on the row.
  // 5.F.01 — archive rows are cold storage; tapping still opens Detail (read
  // path works because `get(id)` reads `expenses` only and the JOIN is a
  // no-op for archived ids — but selection-mode entry and swipe-delete stay
  // disabled in archive mode).
  const onRowPress = useCallback((id) => {
    if (selectionMode) toggleSelect(id);
    else navigation.navigate('Detail', { id });
  }, [selectionMode, toggleSelect, navigation]);

  const onRowLongPress = useCallback((id) => {
    if (viewingArchive) return;
    toggleSelect(id);
  }, [toggleSelect, viewingArchive]);

  const onRowSwipeDelete = useCallback(async (id, merchant) => {
    if (viewingArchive) return;
    try {
      await removeExpense(id);
      toast(`Deleted: ${merchant}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreExpense(id); }
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
  }, [removeExpense, restoreExpense, toast, viewingArchive]);

  const renderItem = useCallback(({ item, index, section }) => (
    <ExpenseRow
      expense={item}
      F={F}
      sym={sym}
      isFirst={index === 0}
      isLast={index === section.data.length - 1}
      isSelected={selectedIds.has(item.id)}
      selectionMode={selectionMode}
      onPress={onRowPress}
      onLongPress={onRowLongPress}
      onSwipeDelete={onRowSwipeDelete}
    />
  ), [F, sym, selectedIds, selectionMode, onRowPress, onRowLongPress, onRowSwipeDelete]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
      marginBottom: 8, marginTop: 16 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: F.ink2 }}>
        {section.title}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: F.line }} />
      <Text style={{ fontSize: 12, color: F.ink3 }}>
        {sym}{section.total.toFixed(2)}
      </Text>
    </View>
  ), [F, sym]);

  const keyExtractor = useCallback((item) => String(item.id), []);

  const ListHeader = useMemo(() => (
    <View style={{ backgroundColor: F.cream, borderRadius: 20, padding: 18 }}>
      <Text style={{ fontSize: 12, color: F.ink2 }}>
        {viewingArchive && '📦 Archive · '}
        {filtered.length} {filtered.length === 1 ? 'spend' : 'spends'}
        {!viewingArchive && filter !== 'all' && !hasActiveFilters(criteria) && ` · ${pots.find(p => p.id === filter)?.label || ''}`}
        {sqlLoading && ' · loading…'}
      </Text>
      <Text style={{ fontSize: 38, color: F.ink, fontWeight: '400', marginTop: 4 }}>
        {sym}{total.toFixed(2)}
      </Text>
    </View>
  ), [F, sym, filtered.length, total, filter, criteria, pots, sqlLoading, viewingArchive]);

  const ListEmpty = useMemo(() => (
    <View style={{ alignItems: 'center', paddingVertical: 60 }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>🌱</Text>
      <Text style={{ fontSize: 15, color: F.ink2 }}>Nothing here yet</Text>
      <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4 }}>
        {hasActiveFilters(criteria) ? 'Try loosening the filter' : 'Tap + to add a spend'}
      </Text>
    </View>
  ), [F, criteria]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      {tagHintTrip && !selectionMode && (
        <View style={{ backgroundColor: F.cream, borderBottomWidth: 1, borderBottomColor: F.line,
          paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontSize: 12, color: F.ink, fontWeight: '600' }}>
            ✈️ Tagging to {tagHintTrip.destination || tagHintTrip.name}
          </Text>
          <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>
            Long-press an expense to enter selection mode, then tap "Tag trip" in the action bar.
          </Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: F.line, backgroundColor: F.surface }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        <FilterPill active={filter === 'all' && !hasActiveFilters(criteria) && !viewingArchive}
          onPress={() => { setFilter('all'); setCriteria({}); setViewingArchive(false); }} F={F}>All</FilterPill>
        {pots.map((p) => (
          <FilterPill key={p.id} active={filter === p.id && !viewingArchive}
            onPress={() => { setViewingArchive(false); onPillPress(p.id); }} F={F}>
            {p.emoji} {p.label}
          </FilterPill>
        ))}
        <TouchableOpacity onPress={() => { setViewingArchive(false); setSheetOpen(true); }} activeOpacity={0.75}
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
        {archiveCount > 0 && (
          <FilterPill active={viewingArchive} onPress={toggleArchive} F={F}>
            📦 Archive ({archiveCount})
          </FilterPill>
        )}
      </ScrollView>

      <SectionList
        style={viewingArchive ? { opacity: 0.65 } : undefined}
        sections={filtered.length === 0 ? [] : sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          padding: 16,
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
        removeClippedSubviews
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={11}
      />

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setCriteria(normalizeCriteria(next));
          const ids = next.categoryIds || [];
          setFilter(ids.length === 1 ? ids[0] : 'all');
        }}
        initialCriteria={criteria}
      />

      {/* 5.8 — batch action bar. */}
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
          <ActionBtn F={F} icon="✈️" label="Tag trip" onPress={() => setTripPickerOpen(true)}/>
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
      <TripPickerSheet
        visible={tripPickerOpen}
        count={selectedIds.size}
        onClose={() => setTripPickerOpen(false)}
        onPick={runBatchRetrip}
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
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
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

export default React.memo(withProfiler('AllExpenses', AllExpenses));
