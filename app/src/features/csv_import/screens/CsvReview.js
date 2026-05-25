// 7.15 — CSV review + reconciliation screen.
//
// Receives parsed rows from CsvImport via navigation params, runs dedupe
// against the user's existing expenses, then renders one row per parsed
// entry with: include toggle, dedupe flag, category dropdown, merchant +
// amount + date display. Bulk Commit runs every kept row through
// addExpense in a single tight loop (no transaction wrapper — the existing
// addExpense already triggers a refreshSummary per call, and the cost of
// a few extra summary recomputes is negligible vs. partial-failure recovery).

import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useExpenses } from '@features/expenses/context';
import { useCategories } from '@features/categories/context';
import { useSettings } from '@features/profile/settings.context';
import { markDuplicates } from '@features/csv_import/dedupe';
import { csvImportsRepo } from '@features/csv_import/repo';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

function fmt(sym, n) {
  const v = Math.round(Number(n) || 0);
  return `${sym}${v.toLocaleString('en-IN')}`;
}

function CsvReview({ route, navigation }) {
  const { F } = useTheme();
  const { sym } = useSettings();
  const { expenses, addExpense } = useExpenses();
  const { categories } = useCategories();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const format   = route?.params?.format || 'unknown';
  const rowsIn   = route?.params?.rows   || [];
  const filename = route?.params?.filename || null;

  // Reconcile against the user's live expenses + add per-row state.
  const initialRows = useMemo(() => {
    const flagged = markDuplicates(rowsIn, expenses, { dayTolerance: 3 });
    return flagged.map((r, i) => ({
      ...r,
      _id: i,
      // Default: keep debits that aren't flagged as duplicates; skip credits +
      // duplicates. Credits are inflows (not expenses) so default-skip is
      // correct unless the user opts in.
      keep: r.type === 'debit' && !r.dedupe,
      category_id: null,
    }));
  }, [rowsIn, expenses]);

  const [rows, setRows] = useState(initialRows);
  useEffect(() => { setRows(initialRows); }, [initialRows]);

  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => {
    const debits  = rows.filter(r => r.type === 'debit');
    const credits = rows.filter(r => r.type === 'credit');
    const flagged = rows.filter(r => r.dedupe);
    const keep    = rows.filter(r => r.keep);
    const total   = keep.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return { total: rows.length, debits: debits.length, credits: credits.length, flagged: flagged.length, kept: keep.length, sum: total };
  }, [rows]);

  function toggleKeep(id, next) {
    setRows(prev => prev.map(r => r._id === id ? { ...r, keep: next } : r));
  }
  function setCategory(id, catId) {
    setRows(prev => prev.map(r => r._id === id ? { ...r, category_id: catId } : r));
  }

  async function commit() {
    const keep = rows.filter(r => r.keep);
    if (!keep.length) {
      Alert.alert('Nothing to import', 'Toggle some rows ON to keep them.');
      return;
    }
    setBusy(true);
    try {
      let imported = 0;
      for (const r of keep) {
        await addExpense({
          merchant: r.merchant || 'Imported',
          amount: Number(r.amount) || 0,
          expense_date: r.date,
          category_id: r.category_id ?? null,
          notes: `Imported from ${format.toUpperCase()} CSV${filename ? ` (${filename})` : ''}\n${r.notes || ''}`.trim(),
          // Treat all CSV imports as non-recurring; credits land as positive
          // expenses too (user opted in) — Drift doesn't model income via
          // expenses, but recording them as 0-credit-flagged is out of scope
          // for v1. The notes field carries the original description.
        });
        imported += 1;
      }
      const skipped = rows.length - imported;
      await csvImportsRepo.create({
        format, filename,
        total_rows: rows.length,
        imported_rows: imported,
        skipped_rows: skipped,
        notes: null,
      });
      toast(`Imported ${imported} row${imported === 1 ? '' : 's'} from ${format.toUpperCase()}`);
      navigation.popToTop();
    } catch (err) {
      logError('csv_import:commit', err);
      Alert.alert('Import failed', err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 120, paddingHorizontal: 16 }}>

        <Text style={{ fontSize: 22, color: F.ink, marginBottom: 4 }}>
          Review {format.toUpperCase()} import
        </Text>
        <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 16 }}>
          {summary.total} row{summary.total === 1 ? '' : 's'} parsed
          {summary.flagged > 0 && ` · ${summary.flagged} flagged as duplicate`}
          {summary.credits > 0 && ` · ${summary.credits} credit${summary.credits === 1 ? '' : 's'}`}
        </Text>

        <View style={{ backgroundColor: F.cream, borderRadius: 16, padding: 14,
          borderWidth: 1, borderColor: F.line, marginBottom: 14 }}>
          <Text style={{ fontSize: 13, color: F.ink2 }}>Ready to import</Text>
          <Text style={{ fontSize: 28, color: F.ink, fontWeight: '500', marginTop: 2 }}>
            {fmt(sym, summary.sum)}
          </Text>
          <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
            {summary.kept} row{summary.kept === 1 ? '' : 's'} kept · {summary.total - summary.kept} skipped
          </Text>
        </View>

        {rows.map((r) => {
          const cat = r.category_id != null ? categories.find(c => c.id === r.category_id) : null;
          return (
            <View key={r._id} style={{ backgroundColor: F.surface, borderRadius: 14,
              padding: 12, marginBottom: 8, borderWidth: 1,
              borderColor: r.dedupe ? F.coral : F.line, opacity: r.keep ? 1 : 0.55 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity onPress={() => toggleKeep(r._id, !r.keep)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: r.keep }}
                  accessibilityLabel={`${r.keep ? 'Skip' : 'Keep'} ${r.merchant}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ width: 22, height: 22, borderRadius: 6,
                    borderWidth: 2, borderColor: r.keep ? F.coral : F.line,
                    backgroundColor: r.keep ? F.coral : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                  {r.keep && <Text style={{ color: '#fff', fontSize: 13 }}>✓</Text>}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>
                    {r.merchant || '(no merchant)'}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                    {r.date} · {r.type === 'credit' ? 'CREDIT' : 'debit'}
                    {r.dedupe && (
                      <Text style={{ color: F.coral }}>
                        {' · '}⚠ possible duplicate of {r.dedupe.match_merchant} ({r.dedupe.match_date})
                      </Text>
                    )}
                  </Text>
                </View>
                <Text style={{ fontSize: 15, color: F.ink, fontWeight: '600' }}>
                  {fmt(sym, r.amount)}
                </Text>
              </View>
              {r.keep && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: 8, gap: 6 }}>
                  <TouchableOpacity onPress={() => setCategory(r._id, null)}
                    hitSlop={{ top: 4, bottom: 4 }}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                      backgroundColor: r.category_id == null ? F.coral : F.cream,
                      borderWidth: 1, borderColor: r.category_id == null ? F.coral : F.line,
                      marginRight: 6 }}>
                    <Text style={{ fontSize: 11, color: r.category_id == null ? '#fff' : F.ink }}>
                      none
                    </Text>
                  </TouchableOpacity>
                  {categories.map((c) => {
                    const sel = r.category_id === c.id;
                    return (
                      <TouchableOpacity key={c.id} onPress={() => setCategory(r._id, c.id)}
                        hitSlop={{ top: 4, bottom: 4 }}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                          backgroundColor: sel ? F.coral : F.cream,
                          borderWidth: 1, borderColor: sel ? F.coral : F.line,
                          marginRight: 6,
                        }}>
                        <Text style={{ fontSize: 11, color: sel ? '#fff' : F.ink }}>
                          {c.emoji} {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16,
        flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}
          activeOpacity={0.85}
          style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: F.surface,
            borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ color: F.ink2, fontSize: 14, fontWeight: '500' }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={commit} disabled={busy || summary.kept === 0}
          activeOpacity={0.85}
          style={{ flex: 2, padding: 14, borderRadius: 14, backgroundColor: F.coral,
            alignItems: 'center', opacity: (busy || summary.kept === 0) ? 0.5 : 1 }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
            {busy ? 'Importing…' : `Import ${summary.kept}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(CsvReview);
