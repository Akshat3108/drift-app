// 5.12 — Receipt image pipeline foundation.
//
// On Scan save we copy the cache-resident receipt into
// `documentDirectory/drift/receipts/{full,thumb}/<uuid>.jpg` so the image
// survives cache eviction. The full image is re-encoded at long-edge ≤
// FULL_MAX (1600px) and quality 0.95; the thumb at long-edge ≤ THUMB_MAX
// (320px) and quality 0.7. The re-encode is what strips EXIF — JPEG
// re-encoding constructs new file bytes from the decoded RGBA, so the
// original EXIF block doesn't carry through.
//
// 8.6 is the COMPLETE pipeline (WebP, sha-1 hash, partitioned yyyy/mm/
// dirs, GC). This module is intentionally minimal; 8.6 will rewrite it.
//
// The function returns null on any failure so the caller (Scan.js) can
// still save the expense with just the legacy `receipt_uri`. The legacy
// reader path stays unchanged — 5.15 owns the flip.

import { logError } from '@core/utils/log';

const FULL_QUALITY = 0.95;
const THUMB_QUALITY = 0.7;
const FULL_MAX = 1600;
const THUMB_MAX = 320;

function uuid() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir(FileSystem, dir) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info?.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

// Move the manipulator's cacheDirectory output into our documentDirectory
// folder. moveAsync is the fast path; falls back to copy + delete if the
// source and destination live on different volumes (rare on Android but
// observed on some emulators).
async function moveOrCopy(FileSystem, from, to) {
  try {
    await FileSystem.moveAsync({ from, to });
  } catch {
    await FileSystem.copyAsync({ from, to });
    try { await FileSystem.deleteAsync(from, { idempotent: true }); } catch {}
  }
}

export async function persistReceipt(srcUri) {
  if (!srcUri) return null;
  let FileSystem, manipulateAsync, SaveFormat;
  try {
    // Lazy-require so Metro doesn't choke when a dev is running on a
    // shell that hasn't been rebuilt against expo-image-manipulator yet.
    // Same pattern as `app/src/ocr/golden/capture.js`.
    FileSystem = require('expo-file-system/legacy');
    ({ manipulateAsync, SaveFormat } = require('expo-image-manipulator'));
  } catch (e) {
    logError('persistReceipt:require', e);
    return null;
  }

  try {
    const baseDir = `${FileSystem.documentDirectory}drift/receipts/`;
    const fullDir = `${baseDir}full/`;
    const thumbDir = `${baseDir}thumb/`;
    await ensureDir(FileSystem, fullDir);
    await ensureDir(FileSystem, thumbDir);

    const id = uuid();
    const fullPath = `${fullDir}${id}.jpg`;
    const thumbPath = `${thumbDir}${id}.jpg`;

    const full = await manipulateAsync(
      srcUri,
      [{ resize: { width: FULL_MAX } }],
      { compress: FULL_QUALITY, format: SaveFormat.JPEG }
    );
    await moveOrCopy(FileSystem, full.uri, fullPath);

    const thumb = await manipulateAsync(
      srcUri,
      [{ resize: { width: THUMB_MAX } }],
      { compress: THUMB_QUALITY, format: SaveFormat.JPEG }
    );
    await moveOrCopy(FileSystem, thumb.uri, thumbPath);

    const info = await FileSystem.getInfoAsync(fullPath);
    return {
      path: fullPath,
      thumb: thumbPath,
      bytes: info?.size ?? 0,
    };
  } catch (e) {
    logError('persistReceipt', e);
    return null;
  }
}
