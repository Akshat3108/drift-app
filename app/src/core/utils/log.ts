// Minimal error/warn logger for catch sites.
// __DEV__ prints to console with context tag so logs are scannable in Metro.
// In release builds this becomes a no-op — no PII or crash logs leave the device.
// PS-18 — TypeScript pilot.

declare const __DEV__: boolean;

export function logError(context: string, err: unknown): void {
  if (__DEV__) {
    const msg = err instanceof Error ? err.message : err;
    const stack = err instanceof Error ? err.stack : '';
    // eslint-disable-next-line no-console
    console.warn(`[drift:${context}]`, msg, stack || '');
  }
}

export function logInfo(context: string, ...args: unknown[]): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[drift:${context}]`, ...args);
  }
}
