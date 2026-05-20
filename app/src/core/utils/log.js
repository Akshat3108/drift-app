// Minimal error/warn logger for catch sites.
// __DEV__ prints to console with context tag so logs are scannable in Metro.
// In release builds this becomes a no-op — no PII or crash logs leave the device.

export function logError(context, err) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[drift:${context}]`, err?.message || err, err?.stack || '');
  }
}

export function logInfo(context, ...args) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[drift:${context}]`, ...args);
  }
}
