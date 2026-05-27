// 8.11 — LockGate. Wraps the main Navigation tree (Onboarding + Orientation
// stay un-gated since lock is opt-in via Profile post-onboarding).
//
// State machine:
//   - On mount with app_lock_enabled=1 AND probe (hardware + enrolment) ok →
//     start locked.
//   - On AppState bg→fg with enabled+engageable → flip to locked.
//   - On successful authenticate() → unlocked for the rest of this fg session.
//
// Renders children ALWAYS, and overlays <LockScreen/> when locked. Keeping
// the tree mounted under the overlay avoids re-fetching providers / re-laying
// out lists every unlock — important on low-end Android.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSettings } from '../profile/settings.context';
import * as LocalAuth from './LocalAuth';
import LockScreen from './LockScreen';

export default function LockGate({ children }) {
  const { settings } = useSettings();
  const enabled = !!settings.app_lock_enabled;

  // engageable = native module present AND hardware available AND credential
  // enrolled. Re-probed on every transition that might engage the lock so
  // restore-from-backup on a new device without enrolment doesn't brick.
  const [engageable, setEngageable] = useState(false);
  const [locked, setLocked] = useState(false);
  // initialProbeDone gates the very first render: while we don't yet know
  // whether the lock should engage, render nothing visible — prevents a
  // one-frame flash of the home screen before the overlay appears on cold
  // start with lock on.
  const [initialProbeDone, setInitialProbeDone] = useState(!enabled);

  const probe = useCallback(async () => {
    if (!enabled) {
      setEngageable(false);
      return false;
    }
    const available = LocalAuth.isAvailable();
    const hasHw = available && (await LocalAuth.hasHardwareAsync());
    const enrolled = hasHw && (await LocalAuth.isEnrolledAsync());
    const e = LocalAuth.shouldEngage({ enabled, available, hasHw, enrolled });
    setEngageable(e);
    return e;
  }, [enabled]);

  // Cold-start probe. Runs once whenever `enabled` flips on (including the
  // initial mount with enabled=1).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const e = await probe();
      if (cancelled) return;
      setLocked(e);
      setInitialProbeDone(true);
    })();
    return () => { cancelled = true; };
  }, [probe]);

  // AppState transitions. bg→fg with the lock engageable flips to locked
  // (re-probing first so a freshly-disabled OS-side credential is reflected).
  const lastStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      const prev = lastStateRef.current;
      lastStateRef.current = next;
      if (prev === 'background' && next === 'active') {
        const e = await probe();
        if (e) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [probe]);

  const handleAuthenticate = useCallback(async () => {
    const res = await LocalAuth.authenticate({ promptMessage: 'Unlock Drift' });
    if (res.success) setLocked(false);
    return res;
  }, []);

  // Belt-and-braces: while the initial probe is in flight, render nothing.
  // Only matters for the very first frame on cold start with lock on; the
  // probe resolves nearly immediately.
  if (!initialProbeDone) return null;

  return (
    <>
      {children}
      {locked && engageable ? <LockScreen onAuthenticate={handleAuthenticate} /> : null}
    </>
  );
}
