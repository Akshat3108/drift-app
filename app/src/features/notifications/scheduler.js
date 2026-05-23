import { Platform } from 'react-native';
import { logError, logInfo } from '../../core/utils/log';

// Thin wrapper around expo-notifications. Loaded lazily / defensively so a
// missing native module (e.g. dev session running JS-only after the dep was
// just installed but before `npm run android`) doesn't crash the provider
// tree. Every method becomes a logged no-op if the module isn't present.
let _N = null;
let _loadAttempted = false;

function loadNotifications() {
  if (_loadAttempted) return _N;
  _loadAttempted = true;
  try {
    // eslint-disable-next-line global-require
    _N = require('expo-notifications');
  } catch (e) {
    logError('notifications:load', e);
    _N = null;
  }
  return _N;
}

const CHANNEL_ID = 'drift-default';

let _foregroundHandlerSet = false;
let _channelEnsured = false;

export function isAvailable() {
  return !!loadNotifications();
}

// Foreground handler must be set once at boot so notifications fired while the
// app is in the foreground actually surface (Android otherwise silently swallows
// them when the app is the foreground task).
export function ensureForegroundHandler() {
  const N = loadNotifications();
  if (!N || _foregroundHandlerSet) return;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    _foregroundHandlerSet = true;
  } catch (e) {
    logError('notifications:foreground-handler', e);
  }
}

async function ensureChannel() {
  const N = loadNotifications();
  if (!N || _channelEnsured) return;
  if (Platform.OS !== 'android') { _channelEnsured = true; return; }
  try {
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Drift',
      importance: N.AndroidImportance?.DEFAULT ?? 3,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: N.AndroidNotificationVisibility?.PUBLIC ?? 1,
      bypassDnd: false,
      enableVibrate: true,
    });
    _channelEnsured = true;
  } catch (e) {
    logError('notifications:channel', e);
  }
}

export async function getPermissionStatus() {
  const N = loadNotifications();
  if (!N) return { granted: false, canAskAgain: false, status: 'unavailable' };
  try {
    const res = await N.getPermissionsAsync();
    return { granted: res.granted, canAskAgain: res.canAskAgain, status: res.status };
  } catch (e) {
    logError('notifications:get-perm', e);
    return { granted: false, canAskAgain: false, status: 'error' };
  }
}

export async function requestPermission() {
  const N = loadNotifications();
  if (!N) return { granted: false, canAskAgain: false, status: 'unavailable' };
  try {
    await ensureChannel();
    const res = await N.requestPermissionsAsync();
    return { granted: res.granted, canAskAgain: res.canAskAgain, status: res.status };
  } catch (e) {
    logError('notifications:request-perm', e);
    return { granted: false, canAskAgain: false, status: 'error' };
  }
}

// Present a notification right now (used by the budget threshold checker when
// it decides a threshold has been crossed).
export async function presentNow({ title, body, data = {} }) {
  const N = loadNotifications();
  if (!N) return null;
  try {
    await ensureChannel();
    const identifier = await N.scheduleNotificationAsync({
      content: { title, body, data, sound: null },
      trigger: null,
    });
    logInfo('notifications:present', identifier, title);
    return identifier;
  } catch (e) {
    logError('notifications:present', e);
    return null;
  }
}

// Schedule a notification for a specific Date. Uses a stable identifier so
// callers can cancel/replace by key. Returns the identifier (or null on
// failure / unavailable module).
export async function scheduleAt({ date, identifier, title, body, data = {} }) {
  const N = loadNotifications();
  if (!N) return null;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (date.getTime() <= Date.now()) return null;
  try {
    await ensureChannel();
    // Cancel any prior schedule for this key so re-scheduling is idempotent.
    await cancelByIdentifier(identifier);
    const id = await N.scheduleNotificationAsync({
      identifier,
      content: { title, body, data, sound: null },
      trigger: { type: N.SchedulableTriggerInputTypes?.DATE ?? 'date', date },
    });
    logInfo('notifications:schedule', id, date.toISOString(), title);
    return id;
  } catch (e) {
    logError('notifications:schedule', e);
    return null;
  }
}

export async function cancelByIdentifier(identifier) {
  const N = loadNotifications();
  if (!N || !identifier) return;
  try {
    await N.cancelScheduledNotificationAsync(identifier);
  } catch {
    // Cancelling a non-existent identifier throws; treat as no-op.
  }
}

export async function cancelAll() {
  const N = loadNotifications();
  if (!N) return;
  try { await N.cancelAllScheduledNotificationsAsync(); }
  catch (e) { logError('notifications:cancel-all', e); }
}

export async function listScheduled() {
  const N = loadNotifications();
  if (!N) return [];
  try { return await N.getAllScheduledNotificationsAsync(); }
  catch (e) { logError('notifications:list-scheduled', e); return []; }
}
