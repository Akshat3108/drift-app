import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { expenses as expRepo } from './repo';
import { items as itemRepo } from '@features/items/repo';
import { tagsRepo } from '@features/tags/repo';
import { tagRulesRepo } from '@features/tags/rulesRepo';
import { autoTagIdsFor } from '@features/tags/ruleMatch';
import { cashRepo } from '@features/accounts/cash';
import { settings as settingsRepo } from '@features/profile/settings.repo';
import { splitsRepo } from '@features/splits/repo';
import { rolloverRepo } from '@features/rollover/repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';
import { useNotifyBus, NOTIFY_EVENTS } from '@core/state/NotifyBus';

const ExpensesContext = createContext(null);

// Caps how many expenses sit in memory at once. Visible feed (Home / AllExpenses)
// reads from this; analytics queries hit SQL directly. Cap removed once 8.1 ships
// FlatList virtualisation.
const EXPENSES_LIMIT = 500;

// Mirror of the SQL ORDER BY used by expRepo.list:
//   ORDER BY expense_date DESC, created_at DESC, id DESC
// Applied after every optimistic patch so a back-dated insert lands in its real
// chronological slot, not at the top.
function sortExpenses(arr) {
  const copy = arr.slice().sort((a, b) => {
    const dateCmp = (b.expense_date || '').localeCompare(a.expense_date || '');
    if (dateCmp !== 0) return dateCmp;
    const createdCmp = (b.created_at || '').localeCompare(a.created_at || '');
    if (createdCmp !== 0) return createdCmp;
    return (b.id || 0) - (a.id || 0);
  });
  return copy.length > EXPENSES_LIMIT ? copy.slice(0, EXPENSES_LIMIT) : copy;
}

// Map a summaryByCategory row to the legacy `pot` shape that screens already
// consume (`spend`/`key`/`label` aliases).
function rowToPot(r) {
  return {
    ...r,
    spend: +((r.spent || 0).toFixed(2)),
    key: r.id,
    label: r.name,
  };
}

function summaryFromRows(rows) {
  const pots = rows.map(rowToPot);
  const totalSpend  = pots.reduce((s, p) => s + p.spend, 0);
  const monthBudget = pots.reduce((s, p) => s + p.budget, 0);
  return { pots, totalSpend, monthBudget };
}

// PS-35 — resolve the auto-tag names a saved expense should pick up from the
// enabled tag_rules. Matches against the persisted row (all axes present) and
// returns tag NAMES (tagsRepo.setForExpense is name-based). Fail-soft: any
// error → no auto-tags, never blocks the save.
async function autoTagNames(matchRow) {
  if (!matchRow) return [];
  try {
    const rules = await tagRulesRepo.enabledRules();
    if (!rules.length) return [];
    const ids = autoTagIdsFor(rules, matchRow);
    if (!ids.length) return [];
    const nameById = new Map(rules.map((r) => [r.tag_id, r.tag_name]));
    return ids.map((id) => nameById.get(id)).filter(Boolean);
  } catch {
    return [];
  }
}

// Union of the user's explicit tag names with rule-derived auto-tags. Returns
// null when there's nothing to write (no explicit set AND no auto-match) so the
// caller can skip touching joins entirely.
function mergeTagNames(explicit, auto) {
  const hasExplicit = Array.isArray(explicit);
  if (!hasExplicit && (!auto || auto.length === 0)) return null;
  return Array.from(new Set([...(hasExplicit ? explicit : []), ...(auto || [])]));
}

// PS-45 — when cash tracking is ON, debit the Cash account for a newly-created
// cash expense (create paths only; edits are reconciled manually). The
// payment-method check gates the settings read so non-cash saves stay cheap.
// Fail-soft: a cash-ledger error never blocks the expense save.
async function maybeApplyCash(row) {
  try {
    if (!row || row.payment_method !== 'cash') return;
    const s = await settingsRepo.get();
    if (!s?.track_cash) return;
    await cashRepo.applyExpense({
      amount: row.amount,
      expenseId: row.id,
      note: `cash · ${row.merchant || ''}`.trim(),
    });
  } catch {
    /* fail-soft — wallet tracking must never break a save */
  }
}

export function ExpensesProvider({ children }) {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ pots: [], totalSpend: 0, monthBudget: 0 });
  const [ready, setReady] = useState(false);
  // PS-05 — global "viewing" month. Mutation paths still anchor to the real
  // current month via `currentMonthKey()` below; this state only steers the
  // read path (summaryByCategory + the screens that subscribe via useApp).
  const [activeMonth, setActiveMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const notifyBus = useNotifyBus();

  // 7.10 — ensure rollover for the current month before summarising. Idempotent.
  // No-op when no category has rollover_enabled or when prior history is absent.
  // Always uses the real current month — rollover is a write that must not
  // shift just because the user is browsing history.
  const currentMonthKey = () => new Date().toISOString().slice(0, 7);

  const resetActiveMonth = useCallback(() => {
    setActiveMonth(currentMonthKey());
  }, []);

  const refreshSummary = useCallback(async () => {
    await rolloverRepo.ensureRolloverForMonth(currentMonthKey()).catch(() => {});
    const rows = await expRepo.summaryByCategory(activeMonth);
    setSummary(summaryFromRows(rows));
    // 7.1 — let the notifications provider re-evaluate budget thresholds against
    // the freshly-rolled pot totals. Fire-and-forget; provider de-bounces its
    // own work via the dedupe index. Notifications still target the real
    // current-month rollup; the bus event is only a "things changed" ping.
    notifyBus?.emit(NOTIFY_EVENTS.EXPENSE_CHANGED);
  }, [notifyBus, activeMonth]);

  const refresh = useCallback(async () => {
    await rolloverRepo.ensureRolloverForMonth(currentMonthKey()).catch(() => {});
    const [e, sumRows] = await Promise.all([
      expRepo.list({ limit: EXPENSES_LIMIT }),
      expRepo.summaryByCategory(activeMonth),
    ]);
    setExpenses(e);
    setSummary(summaryFromRows(sumRows));
    notifyBus?.emit(NOTIFY_EVENTS.EXPENSE_CHANGED);
  }, [notifyBus, activeMonth]);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('expenses', refresh);

  // Optimistic in-memory patching: repos already return the joined row from
  // their create/update paths, so we just splice it into place. refreshSummary
  // runs after the state update — single indexed GROUP BY query.
  const addExpense = useCallback(async (data) => {
    // 7.3 — split tags out of the patch so the expenses table SQL isn't
    // confused by an unknown column. `undefined` means "don't touch joins",
    // an empty array means "clear all joins".
    // 7.9 — same pattern for splits ({person_id, amount}[]).
    const { tags, splits, ...rest } = data || {};
    const row = await expRepo.create(rest);
    // PS-35 — apply auto-tag rules on create (union with any explicit tags).
    const finalTags = row?.id != null ? mergeTagNames(tags, await autoTagNames(row)) : null;
    if (finalTags && row?.id != null) {
      await tagsRepo.setForExpense(row.id, finalTags);
    }
    if (Array.isArray(splits) && row?.id != null) {
      await splitsRepo.setForExpense(row.id, splits);
    }
    await maybeApplyCash(row);                          // PS-45
    setExpenses(prev => sortExpenses([row, ...prev]));
    await refreshSummary();
    return row;
  }, [refreshSummary]);

  const updateExpense = useCallback(async (id, patch) => {
    const { tags, splits, ...rest } = patch || {};
    const row = await expRepo.update(id, rest);
    // PS-35 — only when the user engaged the tag editor (tags is an array) do we
    // re-evaluate rules and union them in; an absent tags field leaves joins be.
    if (Array.isArray(tags)) {
      await tagsRepo.setForExpense(id, mergeTagNames(tags, await autoTagNames(row)) || tags);
    }
    if (Array.isArray(splits)) {
      await splitsRepo.setForExpense(id, splits);
    }
    if (row) setExpenses(prev => sortExpenses(prev.map(e => e.id === id ? row : e)));
    await refreshSummary();
  }, [refreshSummary]);

  const removeExpense = useCallback(async (id) => {
    await expRepo.remove(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    await refreshSummary();
  }, [refreshSummary]);

  const restoreExpense = useCallback(async (id) => {
    await expRepo.restore(id);
    await refresh();
  }, [refresh]);

  // 5.8 — batch ops. Refresh from SQL rather than optimistically patching N
  // rows: the in-memory feed cap (500) means we could be touching most of
  // what's loaded anyway, and the category-joined columns (`category_name`,
  // `category_emoji`, `category_color`) need to be re-fetched on recat.
  const bulkRemoveExpenses = useCallback(async (ids) => {
    const n = await expRepo.bulkRemove(ids);
    await refresh();
    return n;
  }, [refresh]);

  const bulkRestoreExpenses = useCallback(async (ids) => {
    const n = await expRepo.bulkRestore(ids);
    await refresh();
    return n;
  }, [refresh]);

  const bulkRecategorizeExpenses = useCallback(async (ids, category_id) => {
    const n = await expRepo.bulkUpdateCategory(ids, category_id);
    await refresh();
    return n;
  }, [refresh]);

  // PS-07 — batch trip-tag. `trip_id = null` clears the tag.
  const bulkRetripExpenses = useCallback(async (ids, trip_id) => {
    const n = await expRepo.bulkUpdateTrip(ids, trip_id);
    await refresh();
    return n;
  }, [refresh]);

  // PS-30 — confirm flips a pending row to live (refresh so it enters the feed
  // + summary). Dismiss hard-deletes (it was never in the feed, so no refresh).
  const confirmPending = useCallback(async (id) => {
    await expRepo.confirmPending(id);
    await refresh();
  }, [refresh]);

  const dismissPending = useCallback(async (id) => {
    await expRepo.dismissPending(id);
  }, []);

  const addExpenseWithItems = useCallback(async ({ expense, items }) => {
    // 7.3 — tags come through on the expense slice; pull them out before
    // createWithItems writes the row (its INSERT doesn't know about tags).
    // 7.9 — same pattern for splits.
    const { tags, splits, ...expenseRest } = expense || {};
    const row = await expRepo.createWithItems({ expense: expenseRest, items });
    // PS-35 — auto-tag rules also fire on the scan-save path.
    const finalTags = row?.id != null ? mergeTagNames(tags, await autoTagNames(row)) : null;
    if (finalTags && row?.id != null) {
      await tagsRepo.setForExpense(row.id, finalTags);
    }
    if (Array.isArray(splits) && row?.id != null) {
      await splitsRepo.setForExpense(row.id, splits);
    }
    await maybeApplyCash(row);                          // PS-45
    setExpenses(prev => sortExpenses([row, ...prev]));
    await refreshSummary();
    // 7.8 — Emit a price-observations event so NotificationsProvider can run
    // the price-alert checker against the just-scanned unit prices. Skipped
    // when items is empty/missing (manual expense saves don't observe prices).
    if (Array.isArray(items) && items.length) {
      const observations = items
        .filter(i => i && i.normalized_name && Number.isFinite(Number(i.unit_price)))
        .map(i => ({
          normalized_name: i.normalized_name,
          scanned_price: Number(i.unit_price),
        }));
      if (observations.length) {
        notifyBus?.emit(NOTIFY_EVENTS.PRICE_OBSERVATIONS, { observations });
      }
    }
    return row;
  }, [refreshSummary, notifyBus]);

  const updateExpenseWithItems = useCallback(async (id, patch, items) => {
    const { tags, splits, ...patchRest } = patch || {};
    const updated = await expRepo.update(id, patchRest);
    await itemRepo.replaceItems(id, items, updated?.expense_date);
    if (Array.isArray(tags)) {
      await tagsRepo.setForExpense(id, mergeTagNames(tags, await autoTagNames(updated)) || tags);
    }
    if (Array.isArray(splits)) {
      await splitsRepo.setForExpense(id, splits);
    }
    if (updated) setExpenses(prev => sortExpenses(prev.map(e => e.id === id ? updated : e)));
    await refreshSummary();
  }, [refreshSummary]);

  const value = {
    ready,
    expenses,
    pots: summary.pots,
    totalSpend: summary.totalSpend,
    monthBudget: summary.monthBudget,
    // PS-05 — global month selector. Screens that show month-scoped data
    // (Home, Trends, PS-01..PS-03) should read this and re-fetch when it
    // changes; mutation paths and notifications continue to anchor on the
    // literal current month.
    activeMonth,
    setActiveMonth,
    resetActiveMonth,
    refreshSummary,
    addExpense, updateExpense, removeExpense, restoreExpense,
    bulkRemoveExpenses, bulkRestoreExpenses, bulkRecategorizeExpenses, bulkRetripExpenses,
    addExpenseWithItems, updateExpenseWithItems,
    // PS-30 — pending recurring-debit queue.
    confirmPending, dismissPending,
    pendingList: (...a) => expRepo.pendingList(...a),
    pendingCount: (...a) => expRepo.pendingCount(...a),
    // read-only repo methods exposed so 2.10 can drop `useApp().repos.expenses.*`
    monthlyTrend: (...a) => expRepo.monthlyTrend(...a),
    streakDays:   (...a) => expRepo.streakDays(...a),
    findDuplicate: (...a) => expRepo.findDuplicate(...a),
    // 7.4 — day-aggregation + per-day list for the SpendCalendar screen.
    spendByDay: (...a) => expRepo.spendByDay(...a),
    listByDate: (...a) => expRepo.listByDate(...a),
    // 7.3 — async read-through to the tags repo for screens that want the
    // current tag set for a single expense (Edit/Detail).
    tagsForExpense: (id) => tagsRepo.listForExpense(id),
    // 7.9 — async read-through to the splits repo for screens that want the
    // current split set for a single expense (Edit/Detail).
    splitsForExpense: (id) => splitsRepo.listForExpense(id),
  };
  return <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>;
}

export const useExpenses = () => useContext(ExpensesContext);
