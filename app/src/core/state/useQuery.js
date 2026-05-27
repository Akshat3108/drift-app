// 8.9 — Shared `useQuery` cache hook.
//
// One module-level Map keyed by stable-serialised arrays. Each entry stores
// `{ data, fetchedAt, tags }`. Reads inside `staleTime` are cache hits and
// skip the fetcher. Mutations call `queryCache.invalidate({ tag })` to drop
// every entry whose tags intersect.
//
// LRU bound = 64. Map insertion order doubles as recency: a cache hit
// `delete+set`s the entry to move it to the tail; on insert overflow the
// head entry (least-recently-used) is evicted.
//
// Concurrent-fetch race protection: each `useQuery` instance keeps a
// monotonic `requestRef` counter. A fetch increments it before awaiting;
// when the await resolves it compares against `requestRef.current` and
// silently drops the result if it has moved on. Same pattern Scan.js uses
// in 8.5.
//
// No coupling to RefreshBus. `resetApp()` and `restoreBackup()` call
// `queryCache.clearForReset()` explicitly because their semantics
// (wholesale state replacement) exceed any tag-based invalidation.

import { useCallback, useEffect, useRef, useState } from 'react';
import { logError } from '@core/utils/log';

const LRU_CAP = 64;
const DEFAULT_STALE_MS = 30_000;

const CACHE = new Map();

function serializeKey(key) {
  if (!Array.isArray(key)) {
    throw new Error('useQuery: key must be an array (React-Query convention)');
  }
  return JSON.stringify(key);
}

function lruTouch(serialized) {
  // Move to tail on hit. Map iteration order = insertion order in JS.
  const hit = CACHE.get(serialized);
  if (hit) {
    CACHE.delete(serialized);
    CACHE.set(serialized, hit);
  }
  return hit;
}

function lruEnforce() {
  while (CACHE.size > LRU_CAP) {
    const oldest = CACHE.keys().next().value;
    CACHE.delete(oldest);
  }
}

export const queryCache = {
  get(key) {
    return lruTouch(serializeKey(key));
  },
  set(key, data, tags) {
    const serialized = serializeKey(key);
    CACHE.delete(serialized);
    CACHE.set(serialized, {
      data,
      fetchedAt: Date.now(),
      tags: Array.isArray(tags) ? tags.slice() : [],
    });
    lruEnforce();
  },
  invalidate({ key, tag } = {}) {
    if (key) {
      CACHE.delete(serializeKey(key));
      return;
    }
    if (tag) {
      for (const [k, v] of CACHE) {
        if (v.tags && v.tags.includes(tag)) CACHE.delete(k);
      }
      return;
    }
  },
  invalidateAll() {
    CACHE.clear();
  },
  // Hard reset used by resetApp() + restoreBackup() — drop everything.
  clearForReset() {
    CACHE.clear();
  },
  // Inspection helpers for the Diagnostics screen + tests.
  _size() { return CACHE.size; },
  _keys() { return [...CACHE.keys()]; },
};

export function useQuery({ key, fetcher, tags, staleTime = DEFAULT_STALE_MS, enabled = true }) {
  const serialized = enabled ? serializeKey(key) : null;

  const initial = serialized ? lruTouch(serialized) : null;
  const initialFresh = !!initial && (Date.now() - initial.fetchedAt < staleTime);

  const [data, setData]       = useState(initial ? initial.data : undefined);
  const [loading, setLoading] = useState(!!enabled && !initialFresh);
  const [error, setError]     = useState(null);

  // Stable handles for the callback deps — avoids re-binding `run` on every
  // render when callers pass freshly-bound fetchers.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const staleRef = useRef(staleTime);
  staleRef.current = staleTime;

  // Per-mount monotonic counter. Bumped on each `run`; resolutions whose
  // stamp != current are silently discarded (handles concurrent refresh()
  // calls + unmount-during-fetch).
  const requestRef = useRef(0);

  const run = useCallback(async (force) => {
    if (!serialized) return;
    if (!force) {
      const hit = lruTouch(serialized);
      if (hit && Date.now() - hit.fetchedAt < staleRef.current) {
        setData(hit.data);
        setLoading(false);
        setError(null);
        return;
      }
    }
    const stamp = ++requestRef.current;
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (stamp !== requestRef.current) return;
      queryCache.set(JSON.parse(serialized), result, tagsRef.current);
      setData(result);
      setError(null);
    } catch (e) {
      if (stamp !== requestRef.current) return;
      logError('useQuery', e);
      setError(e);
    } finally {
      if (stamp === requestRef.current) setLoading(false);
    }
  }, [serialized]);

  // Re-run when the serialised key flips. Also runs on mount.
  useEffect(() => {
    if (!serialized) return;
    run(false);
    return () => { requestRef.current++; };
  }, [serialized, run]);

  const refresh = useCallback(async () => {
    if (!serialized) return;
    queryCache.invalidate({ key: JSON.parse(serialized) });
    await run(true);
  }, [serialized, run]);

  return { data, loading, error, refresh };
}
