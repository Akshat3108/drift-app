import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { notificationsRepo } from './repo';
import {
  evaluateBudgetThresholds,
  evaluateSubsDue,
  evaluatePriceAlerts,
  evaluatePantryLowStock,
} from './checkers';
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
  const settingsRef = useRef(settings);
  const symRef = useRef(sym);
  useEffect(() => { potsRef.current = pots; }, [pots]);
  useEffect(() => { subsRef.current = subs; }, [subs]);
  useEffect(() => { pantryRef.current = pantry; }, [pantry]);
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
          evaluatePriceAlerts(),
          evaluatePantry(),
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
      Promise.all([evaluateBudgets(), rescheduleAllSubs(), evaluatePantry()]).catch(() => {});
    }
    prevEnabled.current = now;
  }, [settings?.notifications_enabled, evaluateBudgets, rescheduleAllSubs, evaluatePantry]);

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
  }, [evaluateBudgets, evaluatePantry]));

  useNotifyBusListener(NOTIFY_EVENTS.PANTRY_CHANGED, useCallback(() => {
    evaluatePantry();
  }, [evaluatePantry]));

  useNotifyBusListener(NOTIFY_EVENTS.SUB_UPSERTED, useCallback((sub) => {
    rescheduleSub(sub);
  }, [rescheduleSub]));

  useNotifyBusListener(NOTIFY_EVENTS.SUB_REMOVED, useCallback((payload) => {
    cancelSubSchedule(payload?.id);
  }, [cancelSubSchedule]));

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
