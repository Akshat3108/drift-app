// 7.7 — Pantry list with two tabs.
//
// Inventory tab: every live pantry row, with a -/+ stepper and a "Used up"
// shortcut per row. Tap row → EditPantryItem.
// Shopping tab: only rows where current_qty <= reorder_threshold (and
// threshold isn't NULL). Same row shape with a "Bought" shortcut that
// restores qty to target_qty (or prompts).
// FAB → EditPantryItem (create).

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { usePantry } from '@features/pantry/context';
import { items as itemRepo } from '@features/items/repo';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

// Step size depends on the canonical unit. For weight/volume we use 0.1 (so
// the user can rotate "I used about 100g out of 500g"); for pcs we use 1.
function stepFor(unit) {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === 'pcs' || u === 'pc') return 1;
  return 0.1;
}

function fmtQty(n, unit) {
  const v = Number(n) || 0;
  const out = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
  return `${out} ${unit || ''}`.trim();
}

function PantryRow({ row, F, onPress, onDelete, onStep, onUsedUp, onBought, mode }) {
  const step = stepFor(row.canonical_unit);
  const low = row.reorder_threshold != null
    && Number(row.current_qty) <= Number(row.reorder_threshold);

  return (
    <SwipeableRow F={F} onRightAction={onDelete}>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onDelete}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${row.display_name}`}
        style={{ backgroundColor: F.surface, borderRadius: 18,
          padding: 14, marginBottom: 10, borderWidth: 1,
          borderColor: low ? F.coral : F.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 13,
            backgroundColor: F.cream,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>
              {row.icon || (row.kind === 'produce' ? '🥬' : '🛒')}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink,
              textTransform: 'capitalize' }}>
              {row.display_name}
            </Text>
            <Text style={{ fontSize: 11, color: low ? F.coral : F.ink3, marginTop: 2 }}>
              {fmtQty(row.current_qty, row.canonical_unit)}
              {row.reorder_threshold != null
                ? `  ·  threshold ${fmtQty(row.reorder_threshold, row.canonical_unit)}`
                : '  ·  no threshold set'}
              {low ? '  ·  running low' : ''}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onStep(-step); }}
            accessibilityRole="button"
            accessibilityLabel={`Use ${step} ${row.canonical_unit}`}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
              borderWidth: 1, borderColor: F.line, backgroundColor: F.bg }}>
            <Text style={{ fontSize: 14, color: F.ink, fontWeight: '700' }}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onStep(step); }}
            accessibilityRole="button"
            accessibilityLabel={`Add ${step} ${row.canonical_unit}`}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
              borderWidth: 1, borderColor: F.line, backgroundColor: F.bg }}>
            <Text style={{ fontSize: 14, color: F.ink, fontWeight: '700' }}>+</Text>
          </TouchableOpacity>
          {mode === 'shopping' ? (
            <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onBought(); }}
              accessibilityRole="button"
              accessibilityLabel="Mark as bought"
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                backgroundColor: F.coral, flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>Bought</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onUsedUp(); }}
              accessibilityRole="button"
              accessibilityLabel="Mark as used up"
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                borderWidth: 1, borderColor: F.line, backgroundColor: F.bg, flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: F.ink2, fontWeight: '600' }}>Used up</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </SwipeableRow>
  );
}

function Pantry({ navigation }) {
  const { F } = useTheme();
  const { items, lowStock, incrementQty, markUsedUp, removeItem,
          restoreItem, setQty, updateItem } = usePantry();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('inventory');

  // PS-39 — items still inside their return window. Fetched on focus so a
  // freshly-scanned receipt's returnable items show up without a manual reload.
  const [returnable, setReturnable] = useState([]);
  useFocusEffect(useCallback(() => {
    itemRepo.returnableItems({ limit: 50 }).then(setReturnable).catch(() => setReturnable([]));
  }, []));

  const list = useMemo(() => (tab === 'inventory' ? items : lowStock), [tab, items, lowStock]);

  const handleDelete = useCallback(async (row) => {
    try {
      await removeItem(row.id);
      toast(`Removed: ${row.display_name}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreItem(row.id); }
          catch (err) {
            logError('pantry:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('pantry:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  }, [removeItem, restoreItem, toast]);

  const handleStep = useCallback(async (row, delta) => {
    try { await incrementQty(row.id, delta); }
    catch (err) { logError('pantry:step', err); }
  }, [incrementQty]);

  const handleUsedUp = useCallback(async (row) => {
    try { await markUsedUp(row.id); toast(`Marked used up: ${row.display_name}`); }
    catch (err) { logError('pantry:used-up', err); }
  }, [markUsedUp, toast]);

  const handleBought = useCallback(async (row) => {
    // Shopping list "Bought" restores qty to target_qty when set, else to
    // 2× the reorder_threshold (so the row leaves the shopping list with
    // some headroom). The user can fine-tune via EditPantryItem.
    const restoreTo = row.target_qty != null
      ? Number(row.target_qty)
      : (row.reorder_threshold != null ? Number(row.reorder_threshold) * 2 : 1);
    try { await setQty(row.id, restoreTo); toast(`Restocked: ${row.display_name}`); }
    catch (err) { logError('pantry:bought', err); }
  }, [setQty, toast]);

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}>

        <Text style={{ fontSize: 13, color: F.ink2 }}>Items you track</Text>
        <Text style={{ fontSize: 42, color: F.ink, fontWeight: '400', marginBottom: 4 }}>
          {items.length}
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 20 }}>
          <Text style={{ color: F.coral }}>{lowStock.length} running low</Text>
        </Text>

        {/* PS-39 — items still returnable today. Tap a row → the originating
            spend. Sorted soonest-to-close; closing today/tomorrow flagged. */}
        {returnable.length > 0 && (
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.sageD, marginBottom: 16, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
              <Text style={{ fontSize: 16 }}>↩</Text>
              <Text style={{ fontSize: 13, color: F.ink, fontWeight: '700' }}>
                Returnable now · {returnable.length}
              </Text>
            </View>
            {returnable.map((r, i) => {
              const soon = r.days_left <= 1;
              const leftLabel = r.days_left <= 0 ? 'closes today'
                : r.days_left === 1 ? 'closes tomorrow'
                : `${r.days_left}d left`;
              return (
                <TouchableOpacity key={r.id}
                  onPress={() => navigation.navigate('Detail', { id: r.expense_id })}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 14, paddingVertical: 11,
                    borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: F.ink, fontWeight: '500',
                      textTransform: 'capitalize' }} numberOfLines={1}>{r.name}</Text>
                    <Text style={{ fontSize: 11, color: F.ink3, marginTop: 1 }} numberOfLines={1}>
                      {r.merchant} · by {r.return_by_date}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700',
                    color: soon ? F.coral : F.ink2 }}>{leftLabel}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Tab segmented control */}
        <View style={{ flexDirection: 'row', backgroundColor: F.surface, borderRadius: 14,
          padding: 4, borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
          {[
            { key: 'inventory', label: `Inventory · ${items.length}` },
            { key: 'shopping',  label: `Shopping · ${lowStock.length}` },
          ].map(t => {
            const sel = t.key === tab;
            return (
              <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} activeOpacity={0.7}
                accessibilityRole="tab" accessibilityState={{ selected: sel }}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                  backgroundColor: sel ? F.coral : 'transparent' }}>
                <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink2,
                  fontWeight: sel ? '700' : '500' }}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {list.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: F.surface,
            borderRadius: 20, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>
              {tab === 'inventory' ? '🥗' : '🛒'}
            </Text>
            <Text style={{ fontSize: 15, color: F.ink2 }}>
              {tab === 'inventory' ? 'Pantry is empty' : 'Nothing on the shopping list'}
            </Text>
            <Text style={{ fontSize: 13, color: F.ink3, marginTop: 4, textAlign: 'center' }}>
              {tab === 'inventory'
                ? 'Scan a grocery receipt — items you buy twice or more land here automatically. You can also tap + to add manually.'
                : 'When a pantry item drops to its reorder threshold it shows up here.'}
            </Text>
          </View>
        )}

        {list.map((row) => (
          <PantryRow key={row.id} row={row} F={F} mode={tab}
            onPress={() => navigation.navigate('EditPantryItem', { id: row.id })}
            onDelete={() => handleDelete(row)}
            onStep={(d) => handleStep(row, d)}
            onUsedUp={() => handleUsedUp(row)}
            onBought={() => handleBought(row)}/>
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={() => navigation.navigate('EditPantryItem')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Add pantry item"
        style={{
          position: 'absolute', right: 22, bottom: insets.bottom + 28,
          width: 56, height: 56, borderRadius: 28, backgroundColor: F.coral,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: F.coral, shadowOpacity: 0.45, shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 }, elevation: 10,
        }}>
        <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(Pantry);
