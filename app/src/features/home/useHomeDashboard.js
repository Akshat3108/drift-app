import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../hooks/useAppState';
import { useExpenses } from '@features/expenses/context';
import { useAccounts } from '@features/accounts/context';
import { useTravel } from '@features/travel/context';
import { useItemActions } from '@features/items/context';
import { logError } from '@core/utils/log';

const TTL_MS = 30_000;
const CACHE = new Map();

async function readCached(key, fetcher, force) {
  const hit = CACHE.get(key);
  if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.data;
  const data = await fetcher();
  CACHE.set(key, { data, fetchedAt: Date.now() });
  return data;
}

export function invalidateHomeDashboard(key) {
  if (key) CACHE.delete(key);
  else CACHE.clear();
}

const EMPTY = { net: null, nextTrip: null, streak: 0, topMover: null };

export function useHomeDashboard() {
  const { expenses } = useApp();
  const { streakDays } = useExpenses();
  const { netWorth } = useAccounts();
  const { next: nextTripQuery } = useTravel();
  const { topMover: topMoverQuery } = useItemActions();

  // Hold fetchers in a ref so `load` can stay stable across context re-renders.
  const fetchersRef = useRef(null);
  fetchersRef.current = { netWorth, nextTripQuery, streakDays, topMoverQuery };

  const [data, setData] = useState(EMPTY);

  const load = useCallback(async (force) => {
    const f = fetchersRef.current;
    try {
      const [net, nextTrip, streak, topMover] = await Promise.all([
        readCached('netWorth', f.netWorth, force),
        readCached('nextTrip', f.nextTripQuery, force),
        readCached('streak',   f.streakDays, force),
        readCached('topMover', f.topMoverQuery, force),
      ]);
      setData({ net, nextTrip, streak, topMover });
    } catch (e) {
      logError('home.dashboard', e);
    }
  }, []);

  const refresh = useCallback(async () => {
    invalidateHomeDashboard();
    await load(true);
  }, [load]);

  // Bust the cache + reload when the top-of-list expense id changes
  // (covers add/edit/delete of the most recent expense).
  const versionRef = useRef(undefined);
  const version = expenses[0]?.id ?? '';
  useEffect(() => {
    const changed = versionRef.current !== undefined && versionRef.current !== version;
    versionRef.current = version;
    if (changed) invalidateHomeDashboard();
    load(false);
  }, [version, load]);

  return { ...data, refresh };
}
