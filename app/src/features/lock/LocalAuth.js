// 8.11 — Thin wrapper around expo-local-authentication.
//
// Loaded lazily / defensively so a missing native module (e.g. dev session
// running JS-only after the dep was just installed but before `npm run
// android`) doesn't crash the provider tree — mirrors the pattern used by
// features/notifications/scheduler.js.
//
// The lock policy across the app:
//   - Biometric (fingerprint / face) is the primary factor.
//   - Device PIN / pattern / password is the automatic OS-side fallback
//     (disableDeviceFallback: false). No Drift-managed PIN is stored.
//   - hasHardwareAsync + isEnrolledAsync are the gate so we never offer a
//     lock the user has no way to satisfy.

import { logError } from '../../core/utils/log';

let _LA = null;
let _loadAttempted = false;

function loadLocalAuth() {
  if (_loadAttempted) return _LA;
  _loadAttempted = true;
  try {
    // eslint-disable-next-line global-require
    _LA = require('expo-local-authentication');
  } catch (e) {
    logError('lock:load', e);
    _LA = null;
  }
  return _LA;
}

export function isAvailable() {
  return !!loadLocalAuth();
}

export async function hasHardwareAsync() {
  const LA = loadLocalAuth();
  if (!LA) return false;
  try {
    return !!(await LA.hasHardwareAsync());
  } catch (e) {
    logError('lock:hasHardware', e);
    return false;
  }
}

export async function isEnrolledAsync() {
  const LA = loadLocalAuth();
  if (!LA) return false;
  try {
    return !!(await LA.isEnrolledAsync());
  } catch (e) {
    logError('lock:isEnrolled', e);
    return false;
  }
}

// authenticate() — wraps authenticateAsync into a uniform return shape.
//   { success: true }                       on success
//   { success: false, error, cancelled }    on failure (cancelled distinguishes
//                                           user cancel from hardware fail)
//
// disableDeviceFallback is left false (default) so Android's OS-level PIN /
// pattern / password is offered automatically after biometric retries.
export async function authenticate({ promptMessage, cancelLabel } = {}) {
  const LA = loadLocalAuth();
  if (!LA) return { success: false, error: 'native_module_missing', cancelled: false };
  try {
    const res = await LA.authenticateAsync({
      promptMessage: promptMessage || 'Unlock Drift',
      cancelLabel: cancelLabel || 'Cancel',
      disableDeviceFallback: false,
    });
    if (res?.success) return { success: true };
    const errKey = res?.error || 'unknown';
    return {
      success: false,
      error: errKey,
      cancelled: errKey === 'user_cancel' || errKey === 'system_cancel' || errKey === 'app_cancel',
    };
  } catch (e) {
    logError('lock:authenticate', e);
    return { success: false, error: e?.message || String(e), cancelled: false };
  }
}

// shouldEngage — pure decision helper. Pulled out for table-driven tests.
//   enabled  — settings.app_lock_enabled (truthy)
//   available — native module loaded
//   hasHw    — hasHardwareAsync() result
//   enrolled — isEnrolledAsync() result
// Returns true iff the gate should actually obscure the app until auth.
export function shouldEngage({ enabled, available, hasHw, enrolled }) {
  return !!(enabled && available && hasHw && enrolled);
}
