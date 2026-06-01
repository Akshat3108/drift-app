import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { notificationsRepo } from './repo';
import {
  evaluateBudgetThresholds,
  evaluateSubsDue,
  evaluatePriceAlerts,
  evaluatePantryLowStock,
  evaluateHoldingsNavReminder,
  evaluateInsuranceRenewals,
  evaluateReturnWindows,
  evaluateSubscriptionDrift,
  evaluateBackupReminder,
} from './checkers';
import { items as itemRepo } from '@features/items/repo';
import { subs as subsRepo } from '@features/subs/repo';
import { subscriptionDrift } from '../../analytics';
import {
  ensureForegroundHandler,
  getPermissionStatus,
  requestPermission,
  presentNow,
  scheduleAt,
  cancelByIdentifier,
  isAvailable,
} from './scheduler';
import { useExpenses } from '@features/expenses/context';
import { useSubs } from '@features/subs/context';
import { usePantry } from '@features/pantry/context';
import { usePriceAlerts } from '@features/price_alerts/context';
import { useInvestments } from '@features/investments/context';
import { useInsurance } from '@features/insurance/context';
import { priceAlertsRepo } from '@features/price_alerts/repo';
import { useSettings } from '@features/profile/settings.context';
import { useNotifyBusListener, NOTIFY_EVENTS } from '@core/state/NotifyBus';

const NotificationsContext = createContext(null);

// Execute a checker plan: log every item to notification_log (dedupe is
// gated by the UNIQUE index; a null return means "already logged, skip")
// and route surviving items to the scheduler.
async function applyPlan(plan) {
  for (const item of plan) {
    const logged = await notificationsRepo.log({
      kind: item.kind,
      title: item.title,
      body: item.body,
      payload: item.payload,
      scheduled_for: item.schedule?.date ? item.schedule.date.toISOString() : null,
      dedupe_key: item.dedupe_key || null,
    });
    if (!logged) continue;
    if (item.schedule?.type === 'now') {
      const sysId = await presentNow({
        title: item.title,
        body: item.body,
        data: { ...(item.payload || {}), notif_id: logged.id },
      });
      if (sysId) await notificationsRepo.markDelivered(logged.id);
    } else if (item.schedule?.type === 'at' && item.schedule.date) {
      await scheduleAt({
        date: item.schedule.date,
        identifier: item.schedule.identifier,
        title: item.title,
        body: item.body,
        data: { ...(item.payload || {}), notif_id: logged.id },
      });
    }
  }
}

export function NotificationsProvider({ children }) {
  const { pots } = useExpenses();
  const { subs } = useSubs();
  const { items: pantry } = usePantry();
  const { alerts: priceAlerts } = usePriceAlerts();
  const { holdings } = useInvestments();
  const { policies: insurancePolicies } = useInsurance();
  const { settings, sym } = useSettings();

  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState({ granted: false, canAskAgain: true, status: 'undetermined' });
  const [ready, setReady] = useState(false);

  // Latest-arg refs so evaluate* callbacks created once still see fresh slices.
  // Without this, the mutation-hook integration on Expenses/Subs would either
  // need to re-create callbacks every render (defeats memoisation downstream)
  // or stale-close over old pots/subs.
  const potsRef = useRef(pots);
  const subsRef = useRef(subs);
  const pantryRef = useRef(pantry);
  const priceAlertsRef = useRef(priceAlerts);
  const holdingsRef = useRef(holdings);
  const insuranceRef = useRef(insurancePolicies);
  const settingsRef = useRef(settings);
  const symRef = useRef(sym);
  useEffect(() => { potsRef.current = pots; }, [pots]);
  useEffect(() => { subsRef.current = subs; }, [subs]);
  useEffect(() => { pantryRef.current = pantry; }, [pantry]);
  useEffect(() => { priceAlertsRef.current = priceAlerts; }, [priceAlerts]);
  useEffect(() => { holdingsRef.current = holdings; }, [holdings]);
  useEffect(() => { insuranceRef.current = insurancePolicies; }, [insurancePolicies]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { symRef.current = sym; }, [sym]);

  const refreshUnread = useCallback(async () => {
    setUnreadCount(await notificationsRepo.unreadCount());
  }, []);

  const evaluateBudgets = useCallback(async () => {
    if (!settingsRef.current?.notifications_enabled) return;
    const plan = evaluateBudgetThresholds({
      pots: potsRef.current,
      settings: settingsRef.current,
      sym: symRef.current,
    });
    if (plan.length) {
      await applyPlan(plan);
      await refreshUnread();
    }
  }, [refreshUnread]);

  // PS-11 — Insurance renewal evaluator. Schedules one notification per
  // policy with a non-null `next_due`, set lead_days before the date at
  // 09:00 local. Re-runs on boot AND on every policy mutation via the
  // INSURANCE_CHANGED bus event below.
  const rescheduleAllInsurance = useCallback(async () => {
    if (!settingsRef.current?.notifications_enabled) return;
    const plan = evaluateInsuranceRenewals({
      policies: insuranceRef.current,
      settings: settingsRef.current,
      sym: symRef.current,
    });
    if (plan.length) {
      await applyPlan(plan);
      await refreshUnread();
    }
  }, [refreshUnread]);

  const reschedulePolicy = useCallback(async (policy) => {
    if (!policy) return;
    await cancelByIdentifier(`insurance:${policy.id}`);
    if (!settingsRef.current?.notifications_enabled) return;
    const plan = evaluateInsuranceRenewals({
      policies: [policy],
      settings: settingsRef.current,
      sym: symRef.current,
    });
    if (plan.length) {
      await applyPlan(plan);
      await refreshUnread();
    }
  }, [refreshUnread]);

  const cancelPolicySchedule = useCallback(async (policyId) => {
    if (policyId == null) return;
    await cancelByIdentifier(`insurance:${policyId}`);
  }, []);

  // PS-10 — Holdings NAV-update reminder. Fires from boot only (monthly
  // dedupe gate keeps it idempotent). No event hooks — holdings rarely
  // change, and the boot pass after the first of the month is the
  // appropriate fire point.
  const evaluateHoldings = useCallback(async () => {
    if (!settingsRef.current?.notifications_enabled) return;
    const plan = evaluateHoldingsNavReminder({
      holdings: holdingsRef.current,
      settings: settingsRef.current,
    });
    if (plan.length) {
      await applyPlan(plan);
      await refreshUnread();
    }
  }, [refreshUnread]);

  // PS-42 — Backup-staleness reminder. Boot + toggle-on only (settings-driven,
  // like the holdings NAV reminder). The notification_log dedupe keeps it to
  // once per month.
  const evaluateBackup = useCallback(async () => {
    if (!settingsRef.current?.notifications_enabled) return;
    const plan = evaluateBackupReminder({ settings: settingsRef.current });
    if (plan.length) {
      await applyPlan(plan);
      await refreshUnread();
    }
  }, [refreshUnread]);

  // 7.7 — Pantry low-stock evaluator. Fires from boot, on every expense
  // change (auto-populate may have moved a row above/below threshold), and
  // on every pantry mutation via the PANTRY_CHANGED bus event.
  const evaluatePantry = useCallback(async () => {
    if (!settingsRef.current?.notifications_enabled) return;
    const plan = evaluatePantryLowStock({
      pantry: pantryRef.current,
      settings: settingsRef.current,
    });
    if (plan.length) {
      await applyPlan(plan);
      await refreshUnread();
    }
  }, [refreshUnread]);

  // 7.8 — Price alert evaluator. Event-driven via PRICE_OBSERVATIONS.
  // `observations` is an array of {normalized_name, scanned_price} extracted
  // from a just-scanned receipt's items. The pure checker returns plan items;
  // applyPlan logs+presents them, and we follow up with markFired so the
  // alert row's baseline_price slides forward for the next jump check.
  const evaluatePriceObservations = useCallback(async (observations) => {
    if (!settingsRef.current?.notifications_enabled) return;
    if (!Array.isArray(observations) || !observations.length) return;
    const plan = evaluatePriceAlerts({
      observations,
      alerts: priceAlertsRef.current || [],
      settings: settingsRef.current,
      sym: symRef.current,
    });
    if (!plan.length) return;

    // We need to know which plan items actually landed (didn't collide on
    // the dedupe UNIQUE) before calling markFired. The shared applyPlan
    // helper runs the log step inline so we mirror that here with a tiny
    // post-hook list, then call markFired for the survivors.
    const fired = [];
    for (const item of plan) {
      const logged = await notificationsRepo.log({
        kind: item.kind,
        title: item.title,
        body: item.body,
        payload: item.payload,
        scheduled_for: item.schedule?.date ? item.schedule.date.toISOString() : null,
        dedupe_key: item.dedupe_key || null,
      });
      if (!logged) continue;
      if (item.schedule?.type === 'now') {
        const sysId = await presentNow({
          title: item.title,
          body: item.body,
          data: { ...(item.payload || {}), notif_id: logged.id },
        });
        if (sysId) await notificationsRepo.markDelivered(logged.id);
      }
      fired.push(item);
    }
    for (const item of fired) {
      const aid = item.payload?.alert_id;
      const scanned = item.payload?.scanned_price;
      if (aid != null && scanned != null) {
        await priceAlertsRepo.markFired(aid, scanned).catch(() => {});
      }
    }
    await refreshUnread();
  }, [refreshUnread]);

  // PS-39 — Return-window reminders. Fetches the still-returnable items and
  // schedules a 09:00 reminder the day before each window closes. Runs on
  // boot, when notifications are toggled on, and on every expense change (a
  // fresh scan adds returnable items). The notification_log dedupe gate keeps
  // re-runs idempotent, so calling this on EXPENSE_CHANGED is cheap.
  const evaluateReturns = useCallback(async () => {
    if (!settingsRef.current?.notifications_enabled) return;
    let returnable = [];
    try { returnable = await itemRepo.returnableItems({ limit: 200 }); }
    catch { return; }
    const plan = evaluateReturnWindows({
      items: returnable,
      settings: settingsRef.current,
    });
    if (plan.length) {
      await applyPlan(plan);
      await refreshUnread();
    }
  }, [refreshUnread]);

  // PS-29 — subscription price-drift alerts. Fetches the drifted subs and runs
  // the price-channel checker, stamping last_alert_at on the subs that actually
  // fired (i.e. logged past the dedupe gate). Runs on boot, toggle-on, and on
  // expense changes (a new linked charge can move the average).
  const evaluateSubDrift = useCallback(async () => {
    if (!settingsRef.current?.notifications_enabled) return;
    let drifts = [];
    try { drifts = await subscriptionDrift(); }
    catch { return; }
    if (!drifts.length) return;
    const plan = evaluateSubscriptionDrift({
      drifts,
      settings: settingsRef.current,
      sym: symRef.current,
    });
    if (!plan.length) return;
    const fired = [];
    for (const item of plan) {
      const logged = await notificationsRepo.log({
        kind: item.kind, title: item.title, body: item.body,
        payload: item.payload, scheduled_for: null, dedupe_key: item.dedupe_key || null,
      });
      if (!logged) continue;
      const sysId = await presentNow({
        title: item.title, body: item.body,
        data: { ...(item.payload || {}), notif_id: logged.id },
      });
      if (sysId) await notificationsRepo.markDelivered(logged.id);
      fired.push(item);
    }
    for (const item of fired) {
      const sid = item.payload?.sub_id;
      if (sid != null) await subsRepo.markAlerted(sid).catch(() => {});
    }
    await refreshUnread();
  }, [refreshUnread]);

  const rescheduleAllSubs = useCallback(async () => {
    if (!settingsRef.current?.notifications_enabled) return;
    const plan = evaluateSubsDue({
      subs: subsRef.current,
      settings: settingsRef.current,
      sym: symRef.current,
    });
    if (plan.length) {
      await applyPlan(plan);
      await refreshUnread();
    }
  }, [refreshUnread]);

  const rescheduleSub = useCallback(async (sub) => {
    if (!sub) return;
    await cancelByIdentifier(`sub:${sub.id}`);
    if (!settingsRef.current?.notifications_enabled) return;
    const plan = evaluateSubsDue({
      subs: [sub],
      settings: settingsRef.current,
      sym: symRef.current,
    });
    if (plan.length) {
      await applyPlan(plan);
      await refreshUnread();
    }
  }, [refreshUnread]);

  const cancelSubSchedule = useCallback(async (subId) => {
    if (subId == null) return;
    await cancelByIdentifier(`sub:${subId}`);
  }, []);

  // Boot pass — set the foreground handler, sync the permission state, kick
  // an initial evaluation against current data, then mark ready.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      ensureForegroundHandler();
      const perm = await getPermissionStatus();
      if (cancelled) return;
      setPermission(perm);
      await refreshUnread();
      if (settingsRef.current?.notifications_enabled) {
        await Promise.all([
          evaluateBudgets(),
          rescheduleAllSubs(),
          evaluatePantry(),
          evaluateHoldings(),
          rescheduleAllInsurance(),
          evaluateReturns(),
          evaluateSubDrift(),
          evaluateBackup(),
        ]);
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
    // intentionally only on mount; refreshUnread/evaluate* are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the user flips notifications_enabled ON, evaluate immediately so
  // they see existing over-budget / upcoming-sub notifications without
  // needing to mutate anything first.
  const prevEnabled = useRef(settings?.notifications_enabled ? 1 : 0);
  useEffect(() => {
    const now = settings?.notifications_enabled ? 1 : 0;
    if (now && !prevEnabled.current) {
      Promise.all([evaluateBudgets(), rescheduleAllSubs(), evaluatePantry(), evaluateHoldings(), rescheduleAllInsurance(), evaluateReturns(), evaluateSubDrift(), evaluateBackup()]).catch(() => {});
    }
    prevEnabled.current = now;
  }, [settings?.notifications_enabled, evaluateBudgets, rescheduleAllSubs, evaluatePantry, evaluateHoldings, rescheduleAllInsurance, evaluateReturns, evaluateSubDrift, evaluateBackup]);

  // NotifyBus listeners — wired here, fired from ExpensesProvider /
  // SubsProvider after their own state has settled.
  useNotifyBusListener(NOTIFY_EVENTS.EXPENSE_CHANGED, useCallback(() => {
    evaluateBudgets();
    // The auto-populate path in expRepo.createWithItems may have lowered
    // (no — added/topped-up) a pantry row above its threshold; re-evaluate
    // pantry too so we catch the case where a row crossed below threshold
    // before the user knew, and also re-eval after the pantry slice
    // refresh has landed (the PantryProvider refresh listener races this
    // emit so we'd evaluate stale data without the second NOTIFY hook).
    evaluatePantry();
    // PS-39 — a fresh scan may have stamped new return-window dates; schedule
    // their reminders. Idempotent via the notification_log dedupe gate.
    evaluateReturns();
    // PS-29 — a newly-linked subscription charge can shift the drift average.
    evaluateSubDrift();
  }, [evaluateBudgets, evaluatePantry, evaluateReturns, evaluateSubDrift]));

  useNotifyBusListener(NOTIFY_EVENTS.PANTRY_CHANGED, useCallback(() => {
    evaluatePantry();
  }, [evaluatePantry]));

  // 7.8 — Price observations from ExpensesProvider.addExpenseWithItems.
  useNotifyBusListener(NOTIFY_EVENTS.PRICE_OBSERVATIONS, useCallback((payload) => {
    evaluatePriceObservations(payload?.observations);
  }, [evaluatePriceObservations]));

  useNotifyBusListener(NOTIFY_EVENTS.SUB_UPSERTED, useCallback((sub) => {
    rescheduleSub(sub);
  }, [rescheduleSub]));

  useNotifyBusListener(NOTIFY_EVENTS.SUB_REMOVED, useCallback((payload) => {
    cancelSubSchedule(payload?.id);
  }, [cancelSubSchedule]));

  // PS-11 — Insurance lifecycle hooks.
  useNotifyBusListener(NOTIFY_EVENTS.INSURANCE_UPSERTED, useCallback((policy) => {
    reschedulePolicy(policy);
  }, [reschedulePolicy]));
  useNotifyBusListener(NOTIFY_EVENTS.INSURANCE_REMOVED, useCallback((payload) => {
    cancelPolicySchedule(payload?.id);
  }, [cancelPolicySchedule]));

  const toggleEnabled = useCallback(async (next, setSetting) => {
    if (next) {
      const perm = await requestPermission();
      setPermission(perm);
      if (!perm.granted) {
        await setSetting('notifications_enabled', 0);
        return { granted: false };
      }
    }
    await setSetting('notifications_enabled', next ? 1 : 0);
    return { granted: true };
  }, []);

  const markRead = useCallback(async (id) => {
    await notificationsRepo.markRead(id);
    await refreshUnread();
  }, [refreshUnread]);

  const markAllRead = useCallback(async () => {
    await notificationsRepo.markAllRead();
    await refreshUnread();
  }, [refreshUnread]);

  const value = useMemo(() => ({
    ready,
    available: isAvailable(),
    permission,
    unreadCount,
    list: (...a) => notificationsRepo.list(...a),
    listUnread: (...a) => notificationsRepo.listUnread(...a),
    markRead,
    markAllRead,
    toggleEnabled,
    evaluateBudgets,
    evaluatePantry,
    rescheduleSub,
    rescheduleAllSubs,
    cancelSubSchedule,
  }), [
    ready, permission, unreadCount,
    markRead, markAllRead, toggleEnabled,
    evaluateBudgets, evaluatePantry,
    rescheduleSub, rescheduleAllSubs, cancelSubSchedule,
  ]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
