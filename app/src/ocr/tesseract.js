// 4.21 — JS wrapper for the native Tesseract module.
//
// The native module (TesseractModule.kt) is bundled with the app on a real
// `expo run:android` build. When the module is absent (Expo Go, web, missing
// rebuild after this task lands), `available` is false and `recognize` returns
// `{ available: false, lines: [] }` so ScanService falls back gracefully — no
// crash, just no Tesseract pass. This is intentional: feature degradation is
// preferable to forcing every dev to rebuild the native app shell.
//
// The native module exposes two methods:
//
//   init(langs: string)   — copies bundled assets/tessdata/*.traineddata to
//                            filesDir/tessdata/ on first call, then initialises
//                            a TessBaseAPI for the requested languages
//                            (e.g. "eng+hin"). Idempotent for the same langs.
//   recognize(uri: string)
//                          — runs OCR on the given file URI, returns an array
//                            of { text, x, y, width, height, confidence }
//                            lines using Tesseract's word/line iterator. The
//                            URI may be `file://...` or a bare absolute path.
//
// Both calls run on a background executor inside the module and resolve via
// promise; the JS side does not block. Errors propagate as rejected promises
// with a stable `code` (`TESSERACT_INIT`, `TESSERACT_RECOGNIZE`).

import { NativeModules, Platform } from 'react-native';
import { logError } from '@core/utils/log';

const native = NativeModules?.Tesseract || null;

export const TesseractEngine = {
  // True only on Android with the native module present. iOS / web / Expo Go
  // all return false today — no Tesseract install on those targets.
  get available() {
    return Platform.OS === 'android' && native != null;
  },

  // Initialise Tesseract for the requested language pack. Safe to call
  // multiple times; the native side guards re-init. `langs` is a Tesseract
  // language string (`eng`, `eng+hin`, etc.). Throws on init failure so
  // callers can decide whether to abandon the fallback.
  async init(langs = 'eng+hin') {
    if (!this.available) return false;
    try {
      await native.init(langs);
      return true;
    } catch (e) {
      logError('tesseract.init', e);
      return false;
    }
  },

  // Run OCR. Always returns `{ available, lines, engine }`. Never throws —
  // callers in the fallback path should treat any failure as "fallback didn't
  // help" and stick with the ML Kit result.
  async recognize(uri, { langs = 'eng+hin' } = {}) {
    if (!this.available) return { available: false, lines: [], engine: null };
    try {
      const ok = await this.init(langs);
      if (!ok) return { available: true, lines: [], engine: 'tesseract', error: 'init_failed' };
      const lines = await native.recognize(uri);
      return { available: true, lines: Array.isArray(lines) ? lines : [], engine: 'tesseract' };
    } catch (e) {
      logError('tesseract.recognize', e);
      return { available: true, lines: [], engine: 'tesseract', error: e?.message || 'unknown' };
    }
  },
};
