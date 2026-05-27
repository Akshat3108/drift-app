import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../../hooks/useAppState';
import { useExpenses } from '@features/expenses/context';
import { useAccounts } from '@features/accounts/context';
import { useTravel } from '@features/travel/context';
import { useItemActions } from '@features/items/context';
import { useQuery, queryCache } from '@core/state/useQuery';

// 8.9 — retrofitted onto the shared `useQuery`. Each of the four dashboard
// slices is its own `home/<slice>` cache key, tagged `home` so a single
// `queryCache.invalidate({ tag: 'home' })` wipes the whole dashboard when
// the top-of-list expense id flips. The 30s staleTime + LRU cap come from
// the primitive's defaults; no per-key tuning needed today.
const STALE_MS = 30_000;

export function invalidateHomeDashboard() {
  queryCache.invalidate({ tag: 'home' });
}

export function useHomeDashboard() {
  const { expenses } = useApp();
  const { streakDays } = useExpenses();
  const { netWorth } = useAccounts();
  const { next: nextTripQuery } = useTravel();
  const { topMover: topMoverQuery } = useItemActions();

  // Cache live, stable fetcher handles. The query hook holds a ref to the
  // fetcher anyway, but passing a thin wrapper keeps the cache hits cheap.
  const fetchersRef = useRef(null);
  fetchersRef.current = { netWorth, nextTripQuery, streakDays, topMoverQuery };

  const net      = useQuery({ key: ['home', 'netWorth'], fetcher: () => fetchersRef.current.netWorth(),       tags: ['home'], staleTime: STALE_MS });
  const nextTrip = useQuery({ key: ['home', 'nextTrip'], fetcher: () => fetchersRef.current.nextTripQuery(),  tags: ['home'], staleTime: STALE_MS });
  const streak   = useQuery({ key: ['home', 'streak'],   fetcher: () => fetchersRef.current.streakDays(),     tags: ['home'], staleTime: STALE_MS });
  const topMover = useQuery({ key: ['home', 'topMover'], fetcher: () => fetchersRef.current.topMoverQuery(),  tags: ['home'], staleTime: STALE_MS });

  // Bust the home tag + reload when the top-of-list expense id flips
  // (covers add/edit/delete of the most recent expense).
  const versionRef = useRef(undefined);
  const version = expenses[0]?.id ?? '';
  useEffect(() => {
    const changed = versionRef.current !== undefined && versionRef.current !== version;
    versionRef.current = version;
    if (changed) {
      invalidateHomeDashboard();
      net.refresh();
      nextTrip.refresh();
      streak.refresh();
      topMover.refresh();
    }
  }, [version, net, nextTrip, streak, topMover]);

  const refresh = useCallback(async () => {
    invalidateHomeDashboard();
    await Promise.all([net.refresh(), nextTrip.refresh(), streak.refresh(), topMover.refresh()]);
  }, [net, nextTrip, streak, topMover]);

  return {
    net: net.data ?? null,
    nextTrip: nextTrip.data ?? null,
    streak: streak.data ?? 0,
    topMover: topMover.data ?? null,
    refresh,
  };
}
